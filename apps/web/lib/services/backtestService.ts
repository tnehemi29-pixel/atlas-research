import type { FinancialPeriodData } from '@erp/types';
import type { ResearchEventType } from '@prisma/client';
import { db } from '@/lib/db';
import { getFinancials } from '@/lib/services/financialDataService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { addDays, getForwardReturn, getHistoricalPrices, getPriceAsOf, toDateOnly } from '@/lib/services/historicalPriceService';
import { runPointInTimeDcf, filterPeriodsAsOf } from '@/lib/backtest/pointInTimeValuation';
import { deriveHistoricalYears } from '@/lib/valuation/historicals';
import { getQuickComps } from '@/lib/valuation/quickValuation';
import { growthRate, safeDivide } from '@/lib/analytics/ratios';
import { generateMonthlySampleDates } from '@/lib/backtest/sampling';
import { summarizeDistribution, type DistributionStats } from '@/lib/backtest/statistics';
import { computeEventWindowReturn, type EventWindowResult } from '@/lib/backtest/eventStudy';
import { excessReturn, applyTransactionCosts } from '@/lib/backtest/returns';
import { classifyValuationSpread, type ValuationSpreadBucket } from '@/lib/backtest/valuationSpread';
import { buildWalkForwardWindows, type WalkForwardWindow } from '@/lib/backtest/walkForward';
import { segmentByYear, segmentByMarketCapBucket, type SegmentResult } from '@/lib/backtest/robustness';
import { computeFinancialPeriodChanges } from '@/lib/researchEvents/changeDetection';
import { classifyFinancialChange, classifyMarginChange, materialityAtLeast } from '@/lib/researchEvents/materialityConfig';
import { DEFAULT_BENCHMARK_TICKER, EVENT_STUDY_WINDOWS, FORWARD_RETURN_HORIZONS_MONTHS, type ForwardReturnHorizonMonths } from '@/lib/backtest/backtestConfig';

/**
 * The Milestone 12 analysis orchestrator. This file (part 1) covers
 * valuation validation (spec section 6) and DCF forecast validation (spec
 * section 7) — both point-in-time-safe by construction, since both are
 * built entirely on lib/backtest/pointInTimeValuation.ts and
 * lib/services/historicalPriceService.ts rather than any "current state"
 * read. Neither function asserts or assumes an outcome (no convergence
 * assumption, no forecast-accuracy claim) — every result is a plain,
 * disclosed empirical observation with its own sample size.
 */

export const VALUATION_VALIDATION_METHODOLOGY = [
  'DCF implied value is recomputed point-in-time for each sample date, using only financial periods filed on or before that date and the actual historical closing price on that date — never today\'s data.',
  'Sampling is monthly (first-of-month), capped at 120 samples per request.',
  'This module does NOT assume a valuation gap converges — it reports the subsequent price and return at each horizon, whatever they turned out to be.',
  'Every forward return is also shown against the benchmark\'s own return over the same window (excess return = asset return - benchmark return) and net of a disclosed default round-trip transaction cost — never assumed to be frictionless.',
  'Past valuation gaps and subsequent returns are historical observations, not a prediction of future performance.',
];

// ---------------------------------------------------------------------------
// Valuation validation (spec section 6)
// ---------------------------------------------------------------------------

export interface ValuationForwardOutcome {
  horizonMonths: ForwardReturnHorizonMonths;
  toDate: string;
  toPrice: number;
  /** Raw (gross) price return over the horizon. */
  returnPct: number;
  /** `returnPct` net of the default disclosed round-trip transaction cost
   * (spec section 17 — "do not assume zero friction automatically"). */
  returnPctNetOfCosts: number;
  /** The benchmark's (DEFAULT_BENCHMARK_TICKER) own return over the same
   * window — null only when benchmark price data isn't available. */
  benchmarkReturnPct: number | null;
  /** returnPct - benchmarkReturnPct (spec section 5's "excess return"). */
  excessReturnPct: number | null;
}

/** The one place every forward-return observation in this milestone is
 * built — raw return, benchmark return, excess return, and the
 * transaction-cost-netted return, all computed together so every analysis
 * (valuation validation, financial signals, research events, valuation
 * spread) reports the same set of figures the same way. Returns null only
 * when the asset's own forward return isn't available (a missing benchmark
 * leg still returns a partial outcome with `benchmarkReturnPct`/
 * `excessReturnPct` null, never silently dropped). */
async function buildForwardOutcome(ticker: string, fromDate: string, horizonMonths: ForwardReturnHorizonMonths): Promise<ValuationForwardOutcome | null> {
  const forward = await getForwardReturn(ticker, fromDate, horizonMonths);
  if (!forward) return null;

  const benchmarkForward = await getForwardReturn(DEFAULT_BENCHMARK_TICKER, fromDate, horizonMonths);
  const benchmarkReturnPct = benchmarkForward?.returnPct ?? null;

  return {
    horizonMonths,
    toDate: forward.toDate,
    toPrice: forward.toPrice,
    returnPct: forward.returnPct,
    returnPctNetOfCosts: applyTransactionCosts(forward.returnPct),
    benchmarkReturnPct,
    excessReturnPct: excessReturn(forward.returnPct, benchmarkReturnPct),
  };
}

export interface ValuationValidationObservation {
  asOfDate: string;
  dcfImpliedValue: number;
  marketPrice: number;
  /** (marketPrice / dcfImpliedValue) - 1 — positive means the market price
   * was ABOVE the DCF's fair value (a premium to the model); negative
   * means below (a discount). */
  premiumDiscountPct: number | null;
  forwardOutcomes: ValuationForwardOutcome[];
}

export interface ValuationValidationResult {
  ticker: string;
  fromDate: string;
  toDate: string;
  sampledDates: number;
  wasCapped: boolean;
  observations: ValuationValidationObservation[];
  statsByHorizon: { horizonMonths: ForwardReturnHorizonMonths; stats: DistributionStats }[];
  methodology: string[];
}

export async function runValuationValidation(rawTicker: string, fromDate: string, toDate: string): Promise<ValuationValidationResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const { dates, wasCapped } = generateMonthlySampleDates(fromDate, toDate);

  const observations: ValuationValidationObservation[] = [];

  for (const asOfDate of dates) {
    const dcf = await runPointInTimeDcf(ticker, asOfDate).catch(() => null);
    if (!dcf || dcf.impliedSharePrice === null || dcf.currentSharePrice === null) continue;

    const forwardOutcomes: ValuationForwardOutcome[] = [];
    for (const horizonMonths of FORWARD_RETURN_HORIZONS_MONTHS) {
      const outcome = await buildForwardOutcome(ticker, asOfDate, horizonMonths);
      if (outcome) forwardOutcomes.push(outcome);
    }

    observations.push({
      asOfDate,
      dcfImpliedValue: dcf.impliedSharePrice,
      marketPrice: dcf.currentSharePrice,
      premiumDiscountPct: growthRate(dcf.currentSharePrice, dcf.impliedSharePrice),
      forwardOutcomes,
    });
  }

  const statsByHorizon = FORWARD_RETURN_HORIZONS_MONTHS.map((horizonMonths) => ({
    horizonMonths,
    stats: summarizeDistribution(
      observations
        .flatMap((o) => o.forwardOutcomes)
        .filter((f) => f.horizonMonths === horizonMonths)
        .map((f) => f.returnPct),
    ),
  }));

  return { ticker, fromDate, toDate, sampledDates: dates.length, wasCapped, observations, statsByHorizon, methodology: VALUATION_VALIDATION_METHODOLOGY };
}

// ---------------------------------------------------------------------------
// DCF forecast validation (spec section 7)
// ---------------------------------------------------------------------------

export const DCF_FORECAST_VALIDATION_METHODOLOGY = [
  'Each forecast was generated point-in-time, using only financial data filed on or before the date the forecast was made — the forecast itself was never revised with hindsight.',
  'Forecast Error = Actual - Forecast. Forecast Error % = Forecast Error / Forecast.',
  '"Free Cash Flow" here is unlevered FCF (NOPAT + D&A - CapEx - change in NWC), matching exactly what the DCF engine itself forecasts — both the forecast and the actual value use this same definition, computed by the same formula (lib/valuation/historicals.ts), so the comparison is apples-to-apples.',
  'A forecast year is only scored once it has actually been reported — a forecast for a fiscal year that has not yet occurred is never scored against a fabricated "actual."',
];

export type DcfForecastMetric = 'revenue' | 'operatingMargin' | 'unleveredFcf';

export interface DcfForecastComparison {
  madeAsOfDate: string;
  forecastFiscalYear: number;
  /** 1 = the fiscal year immediately following the forecast date, 2 = two years out, etc. */
  yearsOut: number;
  metric: DcfForecastMetric;
  forecastValue: number;
  actualValue: number;
  forecastError: number;
  forecastErrorPct: number | null;
}

export interface DcfForecastValidationResult {
  ticker: string;
  comparisons: DcfForecastComparison[];
  statsByMetric: { metric: DcfForecastMetric; stats: DistributionStats }[];
  methodology: string[];
}

function pushComparison(
  comparisons: DcfForecastComparison[],
  madeAsOfDate: string,
  forecastFiscalYear: number,
  yearsOut: number,
  metric: DcfForecastMetric,
  forecastValue: number | null,
  actualValue: number | null,
): void {
  if (forecastValue === null || actualValue === null) return;
  const forecastError = actualValue - forecastValue;
  comparisons.push({ madeAsOfDate, forecastFiscalYear, yearsOut, metric, forecastValue, actualValue, forecastError, forecastErrorPct: safeDivide(forecastError, forecastValue) });
}

/** Walks every annual filing this company has, running a point-in-time DCF
 * "as of" each filing date and comparing its forecast against what
 * actually happened for any forecast year that has since been reported
 * (using the FULLEST currently-known data for that year — the point being
 * validated is forecast accuracy, so the "actual" side is deliberately not
 * itself point-in-time filtered). */
export async function runDcfForecastValidation(rawTicker: string): Promise<DcfForecastValidationResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const allPeriods = (await getFinancials(ticker, 'annual')).periods.filter((p) => p.periodType === 'annual');
  const actualHistoricals = deriveHistoricalYears(allPeriods);
  const actualByFiscalYear = new Map(actualHistoricals.map((h) => [h.fiscalYear, h]));

  const filedDates = [...new Set(allPeriods.map((p) => (p.filingDate !== null ? toDateOnly(p.filingDate) : null)).filter((d): d is string => d !== null))].sort();

  const comparisons: DcfForecastComparison[] = [];

  for (const asOfDate of filedDates) {
    const dcf = await runPointInTimeDcf(ticker, asOfDate).catch(() => null);
    if (!dcf || dcf.forecast.length === 0) continue;

    for (const year of dcf.forecast) {
      const actual = actualByFiscalYear.get(year.fiscalYear);
      if (!actual) continue; // that fiscal year hasn't been reported yet

      pushComparison(comparisons, asOfDate, year.fiscalYear, year.yearIndex, 'revenue', year.revenue, actual.revenue);
      pushComparison(comparisons, asOfDate, year.fiscalYear, year.yearIndex, 'operatingMargin', year.ebitMargin, actual.ebitMargin);
      pushComparison(comparisons, asOfDate, year.fiscalYear, year.yearIndex, 'unleveredFcf', year.unleveredFcf, actual.unleveredFcf);
    }
  }

  const metrics: DcfForecastMetric[] = ['revenue', 'operatingMargin', 'unleveredFcf'];
  const statsByMetric = metrics.map((metric) => ({
    metric,
    stats: summarizeDistribution(comparisons.filter((c) => c.metric === metric).map((c) => c.forecastErrorPct).filter((v): v is number => v !== null)),
  }));

  return { ticker, comparisons, statsByMetric, methodology: DCF_FORECAST_VALIDATION_METHODOLOGY };
}

// ---------------------------------------------------------------------------
// Financial signal validation (spec section 8)
// ---------------------------------------------------------------------------

export const FINANCIAL_SIGNAL_VALIDATION_METHODOLOGY = [
  'A signal "fires" on the date its underlying period was actually filed — never on the fiscal period-end date, which an analyst could not have acted on before the filing existed.',
  'Revenue acceleration/deceleration compares this period\'s YoY growth rate against the PRIOR period\'s YoY growth rate (growth of growth), not simply whether revenue grew.',
  'Margin, FCF, and debt signals only fire when the change clears the same centralized materiality thresholds Milestone 11 uses (lib/researchEvents/materialityConfig.ts) — a trivial, immaterial change is never counted as a "signal."',
  'Guidance increase/decrease signals reuse Milestone 11\'s already-detected GUIDANCE_CHANGE research events directly, rather than re-deriving them.',
  'Every forward return is also shown against the benchmark\'s own return over the same window (excess return) and net of a disclosed default round-trip transaction cost — never assumed to be frictionless.',
  'This is a historical relationship, not a prediction — a positive average return here is not evidence the signal will be predictive again.',
];

export type FinancialSignalType =
  | 'REVENUE_ACCELERATION'
  | 'REVENUE_DECELERATION'
  | 'MARGIN_EXPANSION'
  | 'MARGIN_CONTRACTION'
  | 'FCF_GROWTH'
  | 'DEBT_REDUCTION'
  | 'GUIDANCE_INCREASE'
  | 'GUIDANCE_DECREASE';

export interface SignalObservation {
  ticker: string;
  signalDate: string;
  label: string;
  forwardOutcomes: ValuationForwardOutcome[];
  /** Point-in-time market cap (historical price x point-in-time diluted
   * shares) as of `signalDate` — populated opportunistically for spec
   * section 12's company-size robustness segmentation; null when the
   * required price or share-count data isn't available. */
  marketCap: number | null;
}

export interface FinancialSignalValidationResult {
  signal: FinancialSignalType;
  observations: SignalObservation[];
  statsByHorizon: { horizonMonths: ForwardReturnHorizonMonths; stats: DistributionStats }[];
  methodology: string[];
}

function financialSignalFires(signal: FinancialSignalType, periodsAscending: FinancialPeriodData[], index: number): boolean {
  const current = periodsAscending[index]!;
  const previous = periodsAscending[index - 1] ?? null;
  const changes = computeFinancialPeriodChanges(previous, current);

  switch (signal) {
    case 'MARGIN_EXPANSION':
      return changes.operatingMargin.changeBps !== null && changes.operatingMargin.changeBps > 0 && materialityAtLeast(classifyMarginChange(changes.operatingMargin.changeBps), 'MEDIUM');
    case 'MARGIN_CONTRACTION':
      return changes.operatingMargin.changeBps !== null && changes.operatingMargin.changeBps < 0 && materialityAtLeast(classifyMarginChange(changes.operatingMargin.changeBps), 'MEDIUM');
    case 'FCF_GROWTH':
      return changes.freeCashFlow.changePercent !== null && changes.freeCashFlow.changePercent > 0 && materialityAtLeast(classifyFinancialChange(changes.freeCashFlow.changePercent), 'MEDIUM');
    case 'DEBT_REDUCTION':
      return changes.totalDebt.changePercent !== null && changes.totalDebt.changePercent < 0 && materialityAtLeast(classifyFinancialChange(changes.totalDebt.changePercent), 'MEDIUM');
    case 'REVENUE_ACCELERATION':
    case 'REVENUE_DECELERATION': {
      if (index < 2) return false;
      const priorChanges = computeFinancialPeriodChanges(periodsAscending[index - 2] ?? null, periodsAscending[index - 1]!);
      if (priorChanges.revenue.changePercent === null || changes.revenue.changePercent === null) return false;
      return signal === 'REVENUE_ACCELERATION' ? changes.revenue.changePercent > priorChanges.revenue.changePercent : changes.revenue.changePercent < priorChanges.revenue.changePercent;
    }
    default:
      return false;
  }
}

async function collectFinancialStatementSignalObservations(tickers: string[], signal: FinancialSignalType): Promise<SignalObservation[]> {
  const observations: SignalObservation[] = [];
  const periodsCache = new Map<string, FinancialPeriodData[]>();

  for (const rawTicker of tickers) {
    const ticker = rawTicker.trim().toUpperCase();
    const periods = await getFinancials(ticker, 'annual')
      .then((r) => r.periods.filter((p) => p.periodType === 'annual').sort((a, b) => a.fiscalYear - b.fiscalYear))
      .catch(() => [] as FinancialPeriodData[]);
    periodsCache.set(ticker, periods);

    for (let i = 1; i < periods.length; i += 1) {
      if (!financialSignalFires(signal, periods, i)) continue;
      const period = periods[i]!;
      if (!period.filingDate) continue;
      const filingDate = toDateOnly(period.filingDate);

      const forwardOutcomes = await collectForwardOutcomes(ticker, filingDate);
      if (forwardOutcomes.length === 0) continue;
      const marketCap = await pointInTimeMarketCapForTicker(ticker, filingDate, periodsCache);
      observations.push({ ticker, signalDate: filingDate, label: `FY${period.fiscalYear}`, forwardOutcomes, marketCap });
    }
  }

  return observations;
}

async function collectGuidanceSignalObservations(tickers: string[], direction: 'GUIDANCE_INCREASE' | 'GUIDANCE_DECREASE'): Promise<SignalObservation[]> {
  const normalizedTickers = tickers.map((t) => t.trim().toUpperCase());
  const events = await db.researchEvent.findMany({
    where: { company: { ticker: { in: normalizedTickers } }, type: 'GUIDANCE_CHANGE' },
    include: { company: true, changes: true },
    orderBy: { eventDate: 'asc' },
  });

  const observations: SignalObservation[] = [];
  const periodsCache = new Map<string, FinancialPeriodData[]>();
  for (const event of events) {
    const guidanceChange = event.changes.find((c) => c.changePercent !== null);
    if (!guidanceChange?.changePercent) continue;
    const isIncrease = guidanceChange.changePercent > 0;
    if ((direction === 'GUIDANCE_INCREASE') !== isIncrease) continue;

    const eventDateStr = event.eventDate.toISOString().slice(0, 10);
    const forwardOutcomes = await collectForwardOutcomes(event.company.ticker, eventDateStr);
    if (forwardOutcomes.length === 0) continue;
    const marketCap = await pointInTimeMarketCapForTicker(event.company.ticker, eventDateStr, periodsCache);
    observations.push({ ticker: event.company.ticker, signalDate: eventDateStr, label: event.title, forwardOutcomes, marketCap });
  }

  return observations;
}

/** Point-in-time market cap (historical price x point-in-time diluted
 * shares from the latest period known as of `asOfDate`) — used only to tag
 * observations for spec section 12's company-size robustness segmentation,
 * never for any valuation calculation itself. `periodsCache` lets a caller
 * looping over many events for the same ticker avoid refetching financials
 * per event. */
async function pointInTimeMarketCapForTicker(ticker: string, asOfDate: string, periodsCache: Map<string, FinancialPeriodData[]>): Promise<number | null> {
  let periods = periodsCache.get(ticker);
  if (!periods) {
    periods = await getFinancials(ticker, 'annual')
      .then((r) => r.periods)
      .catch(() => [] as FinancialPeriodData[]);
    periodsCache.set(ticker, periods);
  }

  const known = filterPeriodsAsOf(periods, asOfDate);
  if (known.length === 0) return null;
  const latest = known.reduce((l, p) => (p.fiscalYear > l.fiscalYear ? p : l));
  const dilutedSharesOutstanding = latest.incomeStatement.dilutedSharesOutstanding;
  if (dilutedSharesOutstanding === null) return null;

  const priceAsOf = await getPriceAsOf(ticker, asOfDate);
  return priceAsOf ? priceAsOf.close * dilutedSharesOutstanding : null;
}

async function collectForwardOutcomes(ticker: string, fromDate: string): Promise<ValuationForwardOutcome[]> {
  const forwardOutcomes: ValuationForwardOutcome[] = [];
  for (const horizonMonths of FORWARD_RETURN_HORIZONS_MONTHS) {
    const outcome = await buildForwardOutcome(ticker, fromDate, horizonMonths);
    if (outcome) forwardOutcomes.push(outcome);
  }
  return forwardOutcomes;
}

/** `tickers` defaults to a single company in the UI's simple case, but
 * accepts a list so segmentation/robustness analysis (spec section 12) can
 * pool observations across a watchlist. */
export async function runFinancialSignalValidation(tickers: string[], signal: FinancialSignalType): Promise<FinancialSignalValidationResult> {
  const observations =
    signal === 'GUIDANCE_INCREASE' || signal === 'GUIDANCE_DECREASE'
      ? await collectGuidanceSignalObservations(tickers, signal)
      : await collectFinancialStatementSignalObservations(tickers, signal);

  const statsByHorizon = FORWARD_RETURN_HORIZONS_MONTHS.map((horizonMonths) => ({
    horizonMonths,
    stats: summarizeDistribution(
      observations
        .flatMap((o) => o.forwardOutcomes)
        .filter((f) => f.horizonMonths === horizonMonths)
        .map((f) => f.returnPct),
    ),
  }));

  return { signal, observations, statsByHorizon, methodology: FINANCIAL_SIGNAL_VALIDATION_METHODOLOGY };
}

// ---------------------------------------------------------------------------
// Event study (spec section 9)
// ---------------------------------------------------------------------------

export const EVENT_STUDY_METHODOLOGY = [
  'Abnormal Return = Stock Return over the window − Benchmark Return over the same window (a simple market-adjusted-return model, not a beta-adjusted market-model regression).',
  'Windows are trading-day, not calendar-day, offsets from the nearest trading day on or before the event date.',
  `The benchmark defaults to ${DEFAULT_BENCHMARK_TICKER} (a practical S&P 500 proxy — see docs/backtesting.md).`,
  'An event with insufficient trading-day padding on either side of it (too close to the edge of available price history) is silently excluded from this specific window, not treated as a zero abnormal return.',
];

export type EventStudySource = 'EARNINGS_CALL' | 'RESEARCH_EVENT';

interface RawStudyEvent {
  date: string;
  label: string;
}

export interface EventStudyEventResult {
  ticker: string;
  eventDate: string;
  label: string;
  windows: EventWindowResult[];
}

export interface EventStudyResult {
  source: EventStudySource;
  benchmarkTicker: string;
  events: EventStudyEventResult[];
  statsByWindow: { windowLabel: string; stats: DistributionStats }[];
  methodology: string[];
}

const EVENT_STUDY_PADDING_DAYS = 20;

async function collectRawStudyEvents(ticker: string, source: EventStudySource, researchEventTypeFilter?: ResearchEventType): Promise<RawStudyEvent[]> {
  if (source === 'EARNINGS_CALL') {
    const calls = await listEarningsCalls(ticker).catch(() => []);
    return calls.filter((c) => c.callDate).map((c) => ({ date: c.callDate!.toISOString().slice(0, 10), label: `Q${c.fiscalQuarter} ${c.fiscalYear} earnings call` }));
  }

  const events = await db.researchEvent.findMany({
    where: { company: { ticker }, ...(researchEventTypeFilter ? { type: researchEventTypeFilter } : {}) },
    orderBy: { eventDate: 'asc' },
  });
  return events.map((e) => ({ date: e.eventDate.toISOString().slice(0, 10), label: e.title }));
}

export async function runEventStudy(tickers: string[], source: EventStudySource, options: { benchmarkTicker?: string; researchEventTypeFilter?: ResearchEventType } = {}): Promise<EventStudyResult> {
  const benchmarkTicker = (options.benchmarkTicker ?? DEFAULT_BENCHMARK_TICKER).toUpperCase();
  const events: EventStudyEventResult[] = [];

  for (const rawTicker of tickers) {
    const ticker = rawTicker.trim().toUpperCase();
    const rawEvents = await collectRawStudyEvents(ticker, source, options.researchEventTypeFilter);

    for (const rawEvent of rawEvents) {
      const padFrom = addDays(rawEvent.date, -EVENT_STUDY_PADDING_DAYS);
      const padTo = addDays(rawEvent.date, EVENT_STUDY_PADDING_DAYS);
      const [stockBars, benchmarkBars] = await Promise.all([getHistoricalPrices(ticker, padFrom, padTo), getHistoricalPrices(benchmarkTicker, padFrom, padTo)]);

      const windows = EVENT_STUDY_WINDOWS.map((window) => computeEventWindowReturn(stockBars, benchmarkBars, rawEvent.date, window)).filter((w): w is EventWindowResult => w !== null);
      if (windows.length > 0) events.push({ ticker, eventDate: rawEvent.date, label: rawEvent.label, windows });
    }
  }

  const statsByWindow = EVENT_STUDY_WINDOWS.map((window) => ({
    windowLabel: window.label,
    stats: summarizeDistribution(
      events
        .flatMap((e) => e.windows)
        .filter((w) => w.windowLabel === window.label)
        .map((w) => w.abnormalReturn)
        .filter((v): v is number => v !== null),
    ),
  }));

  return { source, benchmarkTicker, events, statsByWindow, methodology: EVENT_STUDY_METHODOLOGY };
}

// ---------------------------------------------------------------------------
// Research event validation (spec section 10)
// ---------------------------------------------------------------------------

export const RESEARCH_EVENT_VALIDATION_METHODOLOGY = [
  'Forward returns are computed from each event\'s own eventDate (when it actually happened), not detectedAt (when Atlas found it).',
  'Every forward return is also shown against the benchmark\'s own return over the same window (excess return) and net of a disclosed default round-trip transaction cost — never assumed to be frictionless.',
  'This module never implies causality. Results are phrased as "Historically, companies experiencing this event had an average subsequent return of X% across N observations" — never "this event causes stocks to move."',
];

export interface ResearchEventOutcomeResult {
  eventType: ResearchEventType;
  observations: SignalObservation[];
  statsByHorizon: { horizonMonths: number; stats: DistributionStats }[];
  methodology: string[];
}

/** Connects a Milestone 11 research-event type directly to subsequent
 * market outcomes — the general-purpose version of the guidance-specific
 * financial signals above, usable for ANY ResearchEventType. */
export async function runResearchEventOutcomeValidation(tickers: string[], eventType: ResearchEventType, horizonsMonths: number[] = [1, 3, 6]): Promise<ResearchEventOutcomeResult> {
  const normalizedTickers = tickers.map((t) => t.trim().toUpperCase());
  const events = await db.researchEvent.findMany({
    where: { company: { ticker: { in: normalizedTickers } }, type: eventType },
    include: { company: true },
    orderBy: { eventDate: 'asc' },
  });

  const observations: SignalObservation[] = [];
  const periodsCache = new Map<string, FinancialPeriodData[]>();
  for (const event of events) {
    const eventDateStr = event.eventDate.toISOString().slice(0, 10);
    const forwardOutcomes: ValuationForwardOutcome[] = [];
    for (const horizonMonths of horizonsMonths) {
      const outcome = await buildForwardOutcome(event.company.ticker, eventDateStr, horizonMonths as ForwardReturnHorizonMonths);
      if (outcome) forwardOutcomes.push(outcome);
    }
    if (forwardOutcomes.length === 0) continue;
    const marketCap = await pointInTimeMarketCapForTicker(event.company.ticker, eventDateStr, periodsCache);
    observations.push({ ticker: event.company.ticker, signalDate: eventDateStr, label: event.title, forwardOutcomes, marketCap });
  }

  const statsByHorizon = horizonsMonths.map((horizonMonths) => ({
    horizonMonths,
    stats: summarizeDistribution(
      observations
        .flatMap((o) => o.forwardOutcomes)
        .filter((f) => f.horizonMonths === horizonMonths)
        .map((f) => f.returnPct),
    ),
  }));

  return { eventType, observations, statsByHorizon, methodology: RESEARCH_EVENT_VALIDATION_METHODOLOGY };
}

// ---------------------------------------------------------------------------
// Valuation spread analysis (spec section 11)
// ---------------------------------------------------------------------------

export const VALUATION_SPREAD_METHODOLOGY = [
  "The company's own EV/EBITDA multiple is computed point-in-time: EV = point-in-time market cap (historical price x point-in-time diluted shares) + point-in-time total debt - cash; EBITDA = operating income + depreciation & amortization — all from financial periods filed on or before the sample date.",
  'The PEER-median EV/EBITDA is CURRENT data, not historical. Building a parallel point-in-time comps engine for every peer company was out of scope for this milestone, so this spread mixes a point-in-time target multiple against a current-day peer group — treat the spread as directional, not a precise historical reconstruction.',
  'Discount/Neutral/Premium buckets use configurable thresholds (default +/-15% of the peer median).',
  'Every forward return is also shown against the benchmark\'s own return over the same window (excess return) and net of a disclosed default round-trip transaction cost — never assumed to be frictionless.',
  'This module does not assume a discount or premium converges — it reports the subsequent price and return at each horizon, whatever they turned out to be.',
];

export interface ValuationSpreadObservation {
  asOfDate: string;
  companyMultiple: number;
  peerMedianMultiple: number;
  spreadPct: number;
  bucket: ValuationSpreadBucket;
  forwardOutcomes: ValuationForwardOutcome[];
}

export interface ValuationSpreadResult {
  ticker: string;
  fromDate: string;
  toDate: string;
  sampledDates: number;
  wasCapped: boolean;
  /** Always true — surfaced as its own field (not just prose in
   * `methodology`) so a UI can render a persistent, impossible-to-miss
   * disclosure badge next to every spread result. */
  peerDataIsCurrentNotHistorical: true;
  observations: ValuationSpreadObservation[];
  statsByBucket: { bucket: ValuationSpreadBucket; horizonMonths: ForwardReturnHorizonMonths; stats: DistributionStats }[];
  methodology: string[];
}

function computePointInTimeEvToEbitda(periods: FinancialPeriodData[], asOfDate: string, price: number): number | null {
  const known = filterPeriodsAsOf(periods, asOfDate);
  if (known.length === 0) return null;
  const latest = known.reduce((l, p) => (p.fiscalYear > l.fiscalYear ? p : l));

  const { dilutedSharesOutstanding, operatingIncome } = latest.incomeStatement;
  const { shortTermDebt, longTermDebt, cashAndEquivalents } = latest.balanceSheet;
  const depreciationAmortization = latest.cashFlow.depreciationAmortization;
  if (dilutedSharesOutstanding === null || operatingIncome === null || depreciationAmortization === null) return null;

  const totalDebt = (shortTermDebt ?? 0) + (longTermDebt ?? 0);
  const marketCap = price * dilutedSharesOutstanding;
  const ev = marketCap + totalDebt - (cashAndEquivalents ?? 0);
  const ebitda = operatingIncome + depreciationAmortization;
  if (ebitda === 0) return null;
  return ev / ebitda;
}

/** Single-ticker only — a peer-median comparison is inherently target-vs-
 * peer-set, unlike the watchlist-poolable analyses above. */
export async function runValuationSpreadAnalysis(rawTicker: string, fromDate: string, toDate: string): Promise<ValuationSpreadResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const { dates, wasCapped } = generateMonthlySampleDates(fromDate, toDate);

  const [allPeriods, quickComps] = await Promise.all([
    getFinancials(ticker, 'annual')
      .then((r) => r.periods)
      .catch(() => [] as FinancialPeriodData[]),
    getQuickComps(ticker).catch(() => null),
  ]);
  const peerMedianMultiple = quickComps?.peerMedianEvToEbitda ?? null;

  const observations: ValuationSpreadObservation[] = [];
  if (peerMedianMultiple !== null) {
    for (const asOfDate of dates) {
      const priceAsOf = await getPriceAsOf(ticker, asOfDate);
      if (!priceAsOf) continue;

      const companyMultiple = computePointInTimeEvToEbitda(allPeriods, asOfDate, priceAsOf.close);
      if (companyMultiple === null) continue;

      const classification = classifyValuationSpread(companyMultiple, peerMedianMultiple);
      if (!classification) continue;

      const forwardOutcomes = await collectForwardOutcomes(ticker, asOfDate);
      observations.push({ asOfDate, companyMultiple, peerMedianMultiple, spreadPct: classification.spreadPct, bucket: classification.bucket, forwardOutcomes });
    }
  }

  const buckets: ValuationSpreadBucket[] = ['DISCOUNT', 'NEUTRAL', 'PREMIUM'];
  const statsByBucket = buckets.flatMap((bucket) =>
    FORWARD_RETURN_HORIZONS_MONTHS.map((horizonMonths) => ({
      bucket,
      horizonMonths,
      stats: summarizeDistribution(
        observations
          .filter((o) => o.bucket === bucket)
          .flatMap((o) => o.forwardOutcomes)
          .filter((f) => f.horizonMonths === horizonMonths)
          .map((f) => f.returnPct),
      ),
    })),
  );

  return { ticker, fromDate, toDate, sampledDates: dates.length, wasCapped, peerDataIsCurrentNotHistorical: true, observations, statsByBucket, methodology: VALUATION_SPREAD_METHODOLOGY };
}

// ---------------------------------------------------------------------------
// Robustness segmentation (spec section 12)
// ---------------------------------------------------------------------------

export const ROBUSTNESS_METHODOLOGY = [
  "Time-period segmentation buckets each observation by the calendar year of its own signal/event date.",
  'Company-size segmentation buckets each observation by its point-in-time market capitalization; observations without a known market cap are excluded from this axis only, never folded into the smallest bucket.',
  'Sector and market-regime (bull/bear/volatility) segmentation are not implemented in this milestone: Atlas has no point-in-time sector classification or regime-label series, and segmenting by a CURRENT sector or regime label would misrepresent historical conditions. This is a disclosed scope limitation, not a silent omission.',
  'Every segment reports its own sample size alongside its statistics — a segment with too few observations shows "Insufficient observations for meaningful statistical inference" rather than a misleadingly precise number.',
];

export interface RobustnessSegmentationResult {
  byYear: { horizonMonths: ForwardReturnHorizonMonths; segments: SegmentResult[] }[];
  byMarketCapBucket: { horizonMonths: ForwardReturnHorizonMonths; segments: SegmentResult[] }[];
  methodology: string[];
}

/** Segments any dated, forward-outcome-bearing observation set — a
 * FinancialSignalValidationResult's or ResearchEventOutcomeResult's own
 * `observations` (mapped `signalDate` -> `date`), or a
 * ValuationSpreadResult's own `observations` (mapped `asOfDate` -> `date`) —
 * by calendar year and by market-cap bucket. One generic implementation
 * rather than a bespoke segmenter per analysis type. */
export function segmentObservationsForRobustness(observations: { date: string; marketCap?: number | null; forwardOutcomes: ValuationForwardOutcome[] }[]): RobustnessSegmentationResult {
  const byYear = FORWARD_RETURN_HORIZONS_MONTHS.map((horizonMonths) => ({
    horizonMonths,
    segments: segmentByYear(
      observations.flatMap((o) => o.forwardOutcomes.filter((f) => f.horizonMonths === horizonMonths).map((f) => ({ date: o.date, returnPct: f.returnPct }))),
    ),
  }));
  const byMarketCapBucket = FORWARD_RETURN_HORIZONS_MONTHS.map((horizonMonths) => ({
    horizonMonths,
    segments: segmentByMarketCapBucket(
      observations.flatMap((o) => o.forwardOutcomes.filter((f) => f.horizonMonths === horizonMonths).map((f) => ({ date: o.date, returnPct: f.returnPct, marketCap: o.marketCap ?? null }))),
    ),
  }));
  return { byYear, byMarketCapBucket, methodology: ROBUSTNESS_METHODOLOGY };
}

// ---------------------------------------------------------------------------
// Out-of-sample and walk-forward orchestration (spec sections 13-14)
// ---------------------------------------------------------------------------

export const OUT_OF_SAMPLE_METHODOLOGY = [
  'In-sample (training) and out-of-sample (testing) results are each computed by independently running the exact same fixed-methodology analysis over its own date range.',
  'No threshold or parameter is fit on the training range and then applied to testing — this milestone has no tunable parameters to begin with (spec section 18: no strategy optimization).',
  'Results are always labeled IN-SAMPLE or OUT-OF-SAMPLE and never blended into one combined statistic.',
];

export interface TrainTestSplitResult<T> {
  trainPeriod: { fromDate: string; toDate: string };
  testPeriod: { fromDate: string; toDate: string };
  inSample: T;
  outOfSample: T;
  methodology: string[];
}

async function runOutOfSampleSplit<T>(
  runner: (ticker: string, from: string, to: string) => Promise<T>,
  rawTicker: string,
  trainFrom: string,
  trainTo: string,
  testFrom: string,
  testTo: string,
): Promise<TrainTestSplitResult<T>> {
  const [inSample, outOfSample] = await Promise.all([runner(rawTicker, trainFrom, trainTo), runner(rawTicker, testFrom, testTo)]);
  return { trainPeriod: { fromDate: trainFrom, toDate: trainTo }, testPeriod: { fromDate: testFrom, toDate: testTo }, inSample, outOfSample, methodology: OUT_OF_SAMPLE_METHODOLOGY };
}

export function runValuationValidationOutOfSample(rawTicker: string, trainFrom: string, trainTo: string, testFrom: string, testTo: string): Promise<TrainTestSplitResult<ValuationValidationResult>> {
  return runOutOfSampleSplit(runValuationValidation, rawTicker, trainFrom, trainTo, testFrom, testTo);
}

export function runValuationSpreadOutOfSample(rawTicker: string, trainFrom: string, trainTo: string, testFrom: string, testTo: string): Promise<TrainTestSplitResult<ValuationSpreadResult>> {
  return runOutOfSampleSplit(runValuationSpreadAnalysis, rawTicker, trainFrom, trainTo, testFrom, testTo);
}

export const WALK_FORWARD_METHODOLOGY = [
  "Windows use an expanding training start (spec section 14): training always begins at the full range's own start and grows; only the test window slides forward.",
  'Each step reports ONLY its test-window result — a training window is never scored or shown as if it were held-out (out-of-sample) performance.',
  'This milestone has no parameter that is fit to a training window (spec section 18), so walk-forward here validates the temporal STABILITY of one fixed methodology across different historical periods, not classical protection against parameter overfitting.',
];

export interface WalkForwardStepResult<T> {
  window: WalkForwardWindow;
  testResult: T;
}

export interface WalkForwardValidationResult<T> {
  windows: WalkForwardStepResult<T>[];
  methodology: string[];
}

async function runWalkForwardValidation<T>(
  runner: (ticker: string, from: string, to: string) => Promise<T>,
  rawTicker: string,
  fullFrom: string,
  fullTo: string,
  initialTrainYears: number,
  testYears: number,
): Promise<WalkForwardValidationResult<T>> {
  const windows = buildWalkForwardWindows(fullFrom, fullTo, initialTrainYears, testYears);
  const steps: WalkForwardStepResult<T>[] = [];
  for (const window of windows) {
    const testResult = await runner(rawTicker, window.testStart, window.testEnd);
    steps.push({ window, testResult });
  }
  return { windows: steps, methodology: WALK_FORWARD_METHODOLOGY };
}

export function runValuationValidationWalkForward(
  rawTicker: string,
  fullFrom: string,
  fullTo: string,
  initialTrainYears: number,
  testYears: number,
): Promise<WalkForwardValidationResult<ValuationValidationResult>> {
  return runWalkForwardValidation(runValuationValidation, rawTicker, fullFrom, fullTo, initialTrainYears, testYears);
}

export function runValuationSpreadWalkForward(
  rawTicker: string,
  fullFrom: string,
  fullTo: string,
  initialTrainYears: number,
  testYears: number,
): Promise<WalkForwardValidationResult<ValuationSpreadResult>> {
  return runWalkForwardValidation(runValuationSpreadAnalysis, rawTicker, fullFrom, fullTo, initialTrainYears, testYears);
}
