import type { FinancialPeriodData } from '@erp/types';
import { getCompanyOverview } from '@/lib/services/companyService';
import { CompanyNotFoundError, getFinancials } from '@/lib/services/financialDataService';
import { deriveHistoricalYears } from '@/lib/valuation/historicals';
import { buildMarketData } from '@/lib/valuation/marketData';
import { buildDefaultAssumptions, runDcf } from '@/lib/valuation/engine';
import { DEFAULT_BEAR_DELTAS, DEFAULT_BULL_DELTAS } from '@/lib/valuation/scenarios';
import type { DcfResult } from '@/lib/valuation/types';
import { runComps } from '@/lib/comps/engine';
import { CompsTargetNotFoundError, fetchTargetAndPeers, getPeerCandidates } from '@/lib/services/compsDataService';
import type { PeerSelection } from '@/lib/comps/types';
import {
  listFilings,
  getExistingAnalysis as getExistingFilingAnalysis,
} from '@/lib/services/secFilingService';
import {
  listEarningsCalls,
  getExistingAnalysis as getExistingEarningsAnalysis,
  getGuidanceObservations,
} from '@/lib/services/earningsCallService';
import { grossMargin, growthRate, netMargin, operatingMargin, totalDebt as sumTotalDebt } from '@/lib/analytics/ratios';
import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';
import type {
  FinancialChangeKind,
  ResearchCompsAnalysis,
  ResearchCompsMultiples,
  ResearchContext,
  ResearchDcfAnalysis,
  ResearchDcfScenario,
  ResearchEarningsContext,
  ResearchFinancialMetricSeries,
  ResearchFinancialPerformance,
  ResearchKeyMetric,
  ResearchSecFilingContext,
  ResearchSource,
  ResearchSourceType,
} from './types';

/**
 * The Milestone 9 research-data aggregator — the ONLY place that decides
 * what goes into a research report's context. Every number here is either
 * read straight from already-stored data or produced by re-running the
 * existing, pure DCF/comps engines (Milestones 5/6) with their own default
 * assumptions — never recomputed by hand, never touched by an LLM. SEC and
 * earnings-call insights are read via each service's read-only
 * `getExisting*` accessor: this function NEVER triggers a new AI generation
 * or a new filing/transcript fetch as a side effect of building a report.
 */

export class ResearchCompanyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchCompanyNotFoundError';
  }
}

const DEFAULT_PEER_COUNT = 6; // matches components/company/comps/CompsWorkspace.tsx's own default

// ---------------------------------------------------------------------------
// Source registry — the backend-owned, closed set of citable sources. IDs
// are assigned in the order sections are built below; the AI may only ever
// reference an ID that already exists here.
// ---------------------------------------------------------------------------

function createSourceRegistry() {
  const sources: ResearchSource[] = [];
  function add(type: ResearchSourceType, label: string, detail?: string | null, extra?: Partial<ResearchSource>): number {
    const id = sources.length + 1;
    sources.push({ id, type, label, detail: detail ?? null, ...extra });
    return id;
  }
  return { sources, add };
}

// ---------------------------------------------------------------------------
// Financial performance — deterministic, annual, straight from Atlas's own
// normalized financial statements (Milestones 3/4).
// ---------------------------------------------------------------------------

function pointsDiff(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null) return null;
  return current - prior;
}

function buildMetricSeries(
  periods: FinancialPeriodData[],
  label: string,
  changeKind: FinancialChangeKind,
  extractor: (p: FinancialPeriodData) => number | null,
): ResearchFinancialMetricSeries {
  const values = periods.map((p) => ({ fiscalYear: p.fiscalYear, value: extractor(p) }));
  const last = values[values.length - 1] ?? null;
  const prior = values[values.length - 2] ?? null;
  const diff = changeKind === 'points' ? pointsDiff : growthRate;
  const latestYoyChange = last && prior ? diff(last.value, prior.value) : null;
  return { label, changeKind, values, latestYoyChange };
}

function buildFinancialPerformance(
  periods: FinancialPeriodData[],
  dataAsOf: string | null,
  stale: boolean,
  sourceId: number,
): ResearchFinancialPerformance {
  const annual = periods.filter((p) => p.periodType === 'annual').sort((a, b) => a.fiscalYear - b.fiscalYear);

  const metrics: ResearchFinancialMetricSeries[] = [
    buildMetricSeries(annual, 'Revenue', 'growth', (p) => p.incomeStatement.revenue),
    buildMetricSeries(annual, 'Gross Margin', 'points', (p) => grossMargin(p.incomeStatement.grossProfit, p.incomeStatement.revenue)),
    buildMetricSeries(annual, 'Operating Margin', 'points', (p) => operatingMargin(p.incomeStatement.operatingIncome, p.incomeStatement.revenue)),
    buildMetricSeries(annual, 'Net Margin', 'points', (p) => netMargin(p.incomeStatement.netIncome, p.incomeStatement.revenue)),
    buildMetricSeries(annual, 'Diluted EPS', 'growth', (p) => p.incomeStatement.dilutedEps),
    buildMetricSeries(annual, 'Operating Cash Flow', 'growth', (p) => p.cashFlow.operatingCashFlow),
    buildMetricSeries(annual, 'Free Cash Flow', 'growth', (p) => p.cashFlow.freeCashFlow),
  ];

  return { periodType: 'annual', metrics, dataAsOf, stale, sourceId };
}

// ---------------------------------------------------------------------------
// DCF — reruns lib/valuation/engine.ts with its own default assumptions;
// never a new calculation invented for this report.
// ---------------------------------------------------------------------------

function toDcfScenario(label: ResearchDcfScenario['label'], result: DcfResult, terminalGrowthRate: number | null): ResearchDcfScenario {
  const finalYear = result.forecast[result.forecast.length - 1] ?? null;
  const terminalValueSharePct =
    result.enterpriseValue !== null && result.enterpriseValue !== 0 && result.terminalValue.presentValue !== null
      ? result.terminalValue.presentValue / result.enterpriseValue
      : null;

  return {
    label,
    finalYearRevenue: finalYear?.revenue ?? null,
    finalYearOperatingMargin: finalYear?.ebitMargin ?? null,
    finalYearUnleveredFcf: finalYear?.unleveredFcf ?? null,
    wacc: result.wacc.wacc.value,
    terminalGrowthRate,
    terminalValueSharePct,
    enterpriseValue: result.enterpriseValue,
    equityValue: result.equityValue,
    impliedSharePrice: result.impliedSharePrice,
    upsideDownside: result.upsideDownside,
    isValid: result.isValid,
    issues: result.issues.map((i) => i.message),
  };
}

function buildDcfAnalysis(periods: FinancialPeriodData[], overview: NonNullable<Awaited<ReturnType<typeof getCompanyOverview>>>, sourceId: number): ResearchDcfAnalysis {
  const historicals = deriveHistoricalYears(periods);
  const marketData = buildMarketData(overview, periods);
  const assumptions = buildDefaultAssumptions(marketData);

  const base = runDcf({ historicals, marketData, assumptions });
  const bear = runDcf({ historicals, marketData, assumptions, scenarioDeltas: DEFAULT_BEAR_DELTAS });
  const bull = runDcf({ historicals, marketData, assumptions, scenarioDeltas: DEFAULT_BULL_DELTAS });

  const terminalGrowthRate =
    assumptions.terminalValue.method === 'perpetuityGrowth'
      ? assumptions.terminalValue.perpetuityGrowthRate
      : base.terminalValue.impliedPerpetuityGrowth;

  return {
    currentSharePrice: marketData.currentSharePrice,
    forecastYears: assumptions.forecastYears,
    scenarios: [
      toDcfScenario('Bear', bear, terminalGrowthRate),
      toDcfScenario('Base', base, terminalGrowthRate),
      toDcfScenario('Bull', bull, terminalGrowthRate),
    ],
    sourceId,
  };
}

// ---------------------------------------------------------------------------
// Comps — reuses compsDataService + lib/comps/engine.ts exactly as the
// /valuation-multiples and /implied-valuation API routes do, auto-selecting
// the top DEFAULT_PEER_COUNT candidates the same way the comps page's UI does.
// ---------------------------------------------------------------------------

function toCompsMultiples(m: { evToRevenue: { value: number | null }; evToEbitda: { value: number | null }; evToEbit: { value: number | null }; peRatio: { value: number | null } }): ResearchCompsMultiples {
  return {
    evToRevenue: m.evToRevenue.value,
    evToEbitda: m.evToEbitda.value,
    evToEbit: m.evToEbit.value,
    peRatio: m.peRatio.value,
  };
}

/** Returns null (never throws for an expected "no comps available" outcome)
 * so the caller never has to reconcile a thrown error against an
 * already-registered source ID — the source is only ever added once we know
 * a comps analysis genuinely exists to cite. */
async function buildCompsAnalysisData(
  ticker: string,
): Promise<Omit<ResearchCompsAnalysis, 'sourceId'> | null> {
  try {
    const candidates = await getPeerCandidates(ticker);
    if (candidates.length === 0) return null;

    const peerTickers = candidates.slice(0, DEFAULT_PEER_COUNT).map((c) => c.metrics.ticker);
    const { target, peers } = await fetchTargetAndPeers(ticker, peerTickers);
    if (peers.length === 0) return null;

    const peerSelections: PeerSelection[] = peers.map((metrics) => ({
      metrics,
      score: null,
      source: 'calculated',
      excluded: false,
    }));

    const result = runComps({ target, peers: peerSelections });
    const currentPrice = target.price;
    const impliedSharePrice = result.medianImpliedSharePrice;

    return {
      targetMultiples: toCompsMultiples(result.targetMultiples),
      peerMedianMultiples: {
        evToRevenue: result.statistics.evToRevenue.adjusted.median,
        evToEbitda: result.statistics.evToEbitda.adjusted.median,
        evToEbit: result.statistics.evToEbit.adjusted.median,
        peRatio: result.statistics.peRatio.adjusted.median,
      },
      peers: result.peers.map((p) => ({ ticker: p.metrics.ticker, name: p.metrics.name, multiples: toCompsMultiples(p.multiples) })),
      impliedSharePrice,
      upsideDownside: impliedSharePrice !== null && currentPrice !== null ? growthRate(impliedSharePrice, currentPrice) : null,
    };
  } catch (error) {
    if (error instanceof CompsTargetNotFoundError) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// SEC filing context — the latest filing's metadata + already-generated
// analysis (read-only; never triggers a new AI call).
// ---------------------------------------------------------------------------

async function buildSecFilingContext(
  ticker: string,
  registry: ReturnType<typeof createSourceRegistry>,
): Promise<ResearchSecFilingContext | null> {
  const filings = await listFilings(ticker);
  const latest = filings[0];
  if (!latest) return null;

  const sourceId = registry.add(
    'SEC_FILING',
    `SEC ${latest.formType}, filed ${latest.filingDate.toISOString().slice(0, 10)}`,
    null,
    { secFilingId: latest.id },
  );

  const analysisRow = await getExistingFilingAnalysis(latest.id);
  const analysis =
    analysisRow && analysisRow.status === 'SUCCESS'
      ? {
          summary: analysisRow.summary,
          keyChanges: (analysisRow.keyChanges as unknown as Array<{ description: string }>).map((i) => i.description),
          risks: analysisRow.risks as unknown as Array<{ description: string; category: string }>,
          managementCommentary: (analysisRow.managementCommentary as unknown as Array<{ description: string }>).map((i) => i.description),
          capitalAllocation: (analysisRow.capitalAllocation as unknown as Array<{ description: string }>).map((i) => i.description),
          accountingChanges: (analysisRow.accountingChanges as unknown as Array<{ description: string }>).map((i) => i.description),
        }
      : null;

  return {
    filing: {
      id: latest.id,
      formType: latest.formType,
      filingDate: latest.filingDate.toISOString(),
      periodEnd: latest.periodEnd ? latest.periodEnd.toISOString() : null,
    },
    analysis,
    sourceId,
  };
}

// ---------------------------------------------------------------------------
// Earnings-call context — the latest call's metadata + already-generated
// analysis + already-resolved guidance (read-only).
// ---------------------------------------------------------------------------

async function buildEarningsContext(
  ticker: string,
  registry: ReturnType<typeof createSourceRegistry>,
): Promise<ResearchEarningsContext | null> {
  const calls = await listEarningsCalls(ticker);
  const latest = calls[0];
  if (!latest) return null;

  const sourceId = registry.add('EARNINGS_CALL', `Q${latest.fiscalQuarter} ${latest.fiscalYear} Earnings Call`, null, {
    earningsCallId: latest.id,
  });

  const analysisRow = await getExistingEarningsAnalysis(latest.id);
  const analysis =
    analysisRow && analysisRow.status === 'SUCCESS'
      ? {
          summary: analysisRow.summary,
          businessTrends: analysisRow.businessTrends as unknown as Array<{ description: string; category: string }>,
          risks: analysisRow.risks as unknown as Array<{ description: string; category: string }>,
          capitalAllocation: analysisRow.capitalAllocation as unknown as Array<{ description: string; category: string }>,
          managementLanguage: analysisRow.managementLanguage as unknown as Array<{ dimension: string; level: string; observation: string }>,
        }
      : null;

  const guidanceRows = await getGuidanceObservations(latest.id);

  return {
    call: {
      id: latest.id,
      fiscalYear: latest.fiscalYear,
      fiscalQuarter: latest.fiscalQuarter,
      callDate: latest.callDate ? latest.callDate.toISOString() : null,
    },
    analysis,
    guidance: guidanceRows.map((g) => ({
      metricLabel: g.metricLabel,
      period: g.period,
      low: g.low,
      high: g.high,
      midpoint: g.midpoint,
      change: g.change,
    })),
    sourceId,
  };
}

// ---------------------------------------------------------------------------
// Key metrics — a deterministic summary table; every value is pre-formatted
// here so the LLM is never in a position to reformat (or silently alter) a number.
// ---------------------------------------------------------------------------

function buildKeyMetrics(
  financialPerformance: ResearchFinancialPerformance,
  companyOverview: ResearchContext['companyOverview'],
  dcf: ResearchDcfAnalysis | null,
  comps: ResearchCompsAnalysis | null,
  financialSourceId: number,
): ResearchKeyMetric[] {
  const metrics: ResearchKeyMetric[] = [];
  const byLabel = (label: string) => financialPerformance.metrics.find((m) => m.label === label);
  const latestValue = (label: string) => {
    const series = byLabel(label);
    const last = series?.values[series.values.length - 1];
    return last?.value ?? null;
  };

  const revenue = byLabel('Revenue');
  metrics.push({ label: 'Revenue', value: formatCompactCurrency(latestValue('Revenue')), sourceId: financialSourceId });
  metrics.push({ label: 'Revenue Growth (YoY)', value: formatRatioAsPercent(revenue?.latestYoyChange ?? null), sourceId: financialSourceId });
  metrics.push({ label: 'Gross Margin', value: formatRatioAsPercent(latestValue('Gross Margin')), sourceId: financialSourceId });
  metrics.push({ label: 'Operating Margin', value: formatRatioAsPercent(latestValue('Operating Margin')), sourceId: financialSourceId });
  metrics.push({ label: 'Free Cash Flow', value: formatCompactCurrency(latestValue('Free Cash Flow')), sourceId: financialSourceId });
  metrics.push({ label: 'Market Capitalization', value: formatCompactCurrency(companyOverview.marketCap), sourceId: null });
  metrics.push({ label: 'Enterprise Value', value: formatCompactCurrency(companyOverview.enterpriseValue), sourceId: null });

  const base = dcf?.scenarios.find((s) => s.label === 'Base') ?? null;
  if (base) {
    metrics.push({ label: 'DCF Implied Share Price (Base)', value: formatCompactCurrency(base.impliedSharePrice), sourceId: dcf!.sourceId });
    metrics.push({ label: 'DCF Upside / Downside (Base)', value: formatRatioAsPercent(base.upsideDownside), sourceId: dcf!.sourceId });
  }
  if (comps) {
    metrics.push({ label: 'Comps Implied Share Price', value: formatCompactCurrency(comps.impliedSharePrice), sourceId: comps.sourceId });
    metrics.push({ label: 'Comps Upside / Downside', value: formatRatioAsPercent(comps.upsideDownside), sourceId: comps.sourceId });
    metrics.push({ label: 'EV / EBITDA (Target)', value: comps.targetMultiples.evToEbitda !== null ? `${comps.targetMultiples.evToEbitda.toFixed(1)}x` : '—', sourceId: comps.sourceId });
    metrics.push({ label: 'P/E (Target)', value: comps.targetMultiples.peRatio !== null ? `${comps.targetMultiples.peRatio.toFixed(1)}x` : '—', sourceId: comps.sourceId });
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Top-level aggregator
// ---------------------------------------------------------------------------

export async function aggregateResearchContext(rawTicker: string): Promise<ResearchContext> {
  const ticker = rawTicker.trim().toUpperCase();
  const warnings: string[] = [];

  const overview = await getCompanyOverview(ticker);
  if (!overview) {
    throw new ResearchCompanyNotFoundError(`No company found for ticker "${ticker}".`);
  }

  let financials;
  try {
    financials = await getFinancials(ticker, 'annual');
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      throw new ResearchCompanyNotFoundError(`SEC EDGAR has no filer registered for ticker "${ticker}".`);
    }
    throw error;
  }

  const registry = createSourceRegistry();
  const periods = financials.periods;
  const latestPeriod = [...periods].filter((p) => p.periodType === 'annual').sort((a, b) => b.fiscalYear - a.fiscalYear)[0] ?? null;

  const financialSourceId = registry.add(
    'FINANCIAL_STATEMENT',
    'Atlas normalized financial statements (SEC EDGAR)',
    financials.dataAsOf ? `Data as of ${financials.dataAsOf.slice(0, 10)}` : null,
  );
  const financialPerformance = buildFinancialPerformance(periods, financials.dataAsOf, financials.stale, financialSourceId);
  if (financials.stale) warnings.push('Financial statement data is a stale cached snapshot — a live refresh failed.');

  const debt = latestPeriod ? sumTotalDebt(latestPeriod.balanceSheet.shortTermDebt, latestPeriod.balanceSheet.longTermDebt) : null;
  const cash = latestPeriod?.balanceSheet.cashAndEquivalents ?? null;
  const enterpriseValue =
    overview.marketCap !== null && debt !== null && cash !== null ? overview.marketCap + debt - cash : null;

  const companyOverview: ResearchContext['companyOverview'] = {
    ticker: overview.ticker,
    name: overview.name,
    sector: overview.sector,
    industry: overview.industry,
    exchange: overview.exchange,
    country: overview.country,
    price: overview.price,
    marketCap: overview.marketCap,
    enterpriseValue,
    beta: overview.beta,
    yearHigh: overview.yearHigh,
    yearLow: overview.yearLow,
    quoteStale: overview.stale,
  };
  if (overview.stale) warnings.push('Market quote data is a stale cached snapshot — a live refresh failed.');

  let dcfAnalysis: ResearchDcfAnalysis | null = null;
  if (periods.some((p) => p.periodType === 'annual')) {
    const dcfSourceId = registry.add('DCF_MODEL', 'Atlas DCF Model', 'Base/Bear/Bull scenarios, default assumptions');
    dcfAnalysis = buildDcfAnalysis(periods, overview, dcfSourceId);
    const base = dcfAnalysis.scenarios.find((s) => s.label === 'Base');
    if (base && !base.isValid) warnings.push('The DCF model could not fully resolve — see DCF Analysis for the specific blocking inputs.');
  } else {
    warnings.push('Insufficient historical financial data to run the DCF model.');
  }

  let compsAnalysis: ResearchCompsAnalysis | null = null;
  try {
    const compsData = await buildCompsAnalysisData(ticker);
    if (compsData) {
      const compsSourceId = registry.add('COMPS_MODEL', 'Atlas Comparable Company Analysis', `Top ${DEFAULT_PEER_COUNT} peers by similarity score`);
      compsAnalysis = { ...compsData, sourceId: compsSourceId };
    } else {
      warnings.push('No comparable-company peers could be identified for this ticker.');
    }
  } catch {
    warnings.push('Comparable-company analysis is temporarily unavailable.');
  }

  let secFilingContext: ResearchSecFilingContext | null = null;
  try {
    secFilingContext = await buildSecFilingContext(ticker, registry);
    if (!secFilingContext) warnings.push('No SEC filings were found for this ticker.');
    else if (!secFilingContext.analysis) warnings.push('The latest SEC filing has not yet had an AI analysis generated — see SEC Filings for this company.');
  } catch {
    warnings.push('SEC filing data is temporarily unavailable.');
  }

  let earningsContext: ResearchEarningsContext | null = null;
  try {
    earningsContext = await buildEarningsContext(ticker, registry);
    if (!earningsContext) warnings.push('No earnings calls were found for this ticker.');
    else if (!earningsContext.analysis) warnings.push('The latest earnings call has not yet had an AI analysis generated — see Earnings Calls for this company.');
  } catch {
    warnings.push('Earnings-call data is temporarily unavailable.');
  }

  const keyMetrics = buildKeyMetrics(financialPerformance, companyOverview, dcfAnalysis, compsAnalysis, financialSourceId);

  return {
    ticker,
    companyOverview,
    financialPerformance,
    dcfAnalysis,
    compsAnalysis,
    secFilingContext,
    earningsContext,
    keyMetrics,
    sources: registry.sources,
    dataSnapshotAt: new Date().toISOString(),
    warnings,
  };
}
