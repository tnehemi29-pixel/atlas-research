import { ApiError } from './companies';

/**
 * Client-side fetchers for Milestone 12's Historical Backtesting & Research
 * Validation Engine. Response shapes mirror lib/services/backtestService.ts
 * and lib/services/historicalSnapshotService.ts exactly, so the API route
 * handlers stay thin pass-throughs (same convention as lib/api/researchEvents.ts).
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type ForwardReturnHorizonMonthsValue = 1 | 3 | 6 | 12;

export interface DistributionStatsResponse {
  count: number;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  positiveRate: number | null;
  confidenceInterval95: [number, number] | null;
  insufficientData: boolean;
}

export interface ValuationForwardOutcomeResponse {
  horizonMonths: number;
  toDate: string;
  toPrice: number;
  returnPct: number;
  returnPctNetOfCosts: number;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
}

export interface SegmentResultResponse {
  segment: string;
  stats: DistributionStatsResponse;
}

export interface RobustnessSegmentationResponse {
  byYear: { horizonMonths: number; segments: SegmentResultResponse[] }[];
  byMarketCapBucket: { horizonMonths: number; segments: SegmentResultResponse[] }[];
  methodology: string[];
}

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Historical snapshot (spec section 2)
// ---------------------------------------------------------------------------

export interface HistoricalSnapshotResponse {
  ticker: string;
  companyName: string;
  asOfDate: string;
  price: { date: string; close: number } | null;
  marketCap: number | null;
  annualPeriodsKnown: number;
  latestKnownFiscalYear: number | null;
  filings: { id: string; formType: string; filingDate: string }[];
  earningsCalls: { id: string; fiscalYear: number; fiscalQuarter: number; callDate: string | null }[];
  dcf: PointInTimeDcfResponse | null;
  researchEvents: { id: string; type: string; category: string; title: string; materiality: string; eventDate: string }[];
  limitations: string[];
}

export async function fetchHistoricalSnapshot(ticker: string, asOfDate: string, signal?: AbortSignal): Promise<HistoricalSnapshotResponse | null> {
  const response = await fetch(`/api/research-backtest/snapshot?ticker=${encodeURIComponent(ticker)}&asOfDate=${encodeURIComponent(asOfDate)}`, { signal });
  if (response.status === 404) return null;
  return parseOrThrow<HistoricalSnapshotResponse>(response, 'Failed to load the historical snapshot.');
}

// ---------------------------------------------------------------------------
// Valuation validation (spec sections 6, 13, 14)
// ---------------------------------------------------------------------------

export interface PointInTimeDcfResponse {
  asOfDate: string;
  impliedSharePrice: number | null;
  currentSharePrice: number | null;
  upsideDownside: number | null;
  isValid: boolean;
  annualPeriodsKnown: number;
  forecast: { yearIndex: number; fiscalYear: number; revenue: number; ebitMargin: number; unleveredFcf: number }[];
}

export interface ValuationValidationObservationResponse {
  asOfDate: string;
  dcfImpliedValue: number;
  marketPrice: number;
  premiumDiscountPct: number | null;
  forwardOutcomes: ValuationForwardOutcomeResponse[];
}

export interface ValuationValidationResponse {
  ticker: string;
  fromDate: string;
  toDate: string;
  sampledDates: number;
  wasCapped: boolean;
  observations: ValuationValidationObservationResponse[];
  statsByHorizon: { horizonMonths: number; stats: DistributionStatsResponse }[];
  methodology: string[];
}

export interface TrainTestSplitResponse<T> {
  trainPeriod: { fromDate: string; toDate: string };
  testPeriod: { fromDate: string; toDate: string };
  inSample: T;
  outOfSample: T;
  methodology: string[];
}

export interface WalkForwardWindowResponse {
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
}

export interface WalkForwardValidationResponse<T> {
  windows: { window: WalkForwardWindowResponse; testResult: T }[];
  methodology: string[];
}

export async function fetchValuationValidation(ticker: string, from: string, to: string, signal?: AbortSignal): Promise<ValuationValidationResponse> {
  const response = await fetch(`/api/research-backtest/valuation?ticker=${encodeURIComponent(ticker)}&from=${from}&to=${to}`, { signal });
  return parseOrThrow<ValuationValidationResponse>(response, 'Failed to load valuation validation.');
}

export async function fetchValuationValidationOutOfSample(
  ticker: string,
  trainFrom: string,
  trainTo: string,
  testFrom: string,
  testTo: string,
  signal?: AbortSignal,
): Promise<TrainTestSplitResponse<ValuationValidationResponse>> {
  const query = new URLSearchParams({ ticker, mode: 'outOfSample', trainFrom, trainTo, testFrom, testTo });
  const response = await fetch(`/api/research-backtest/valuation?${query.toString()}`, { signal });
  return parseOrThrow(response, 'Failed to load out-of-sample valuation validation.');
}

export async function fetchValuationValidationWalkForward(
  ticker: string,
  from: string,
  to: string,
  initialTrainYears: number,
  testYears: number,
  signal?: AbortSignal,
): Promise<WalkForwardValidationResponse<ValuationValidationResponse>> {
  const query = new URLSearchParams({ ticker, mode: 'walkForward', from, to, initialTrainYears: String(initialTrainYears), testYears: String(testYears) });
  const response = await fetch(`/api/research-backtest/valuation?${query.toString()}`, { signal });
  return parseOrThrow(response, 'Failed to load walk-forward valuation validation.');
}

// ---------------------------------------------------------------------------
// DCF forecast validation (spec section 7)
// ---------------------------------------------------------------------------

export type DcfForecastMetricValue = 'revenue' | 'operatingMargin' | 'unleveredFcf';

export interface DcfForecastComparisonResponse {
  madeAsOfDate: string;
  forecastFiscalYear: number;
  yearsOut: number;
  metric: DcfForecastMetricValue;
  forecastValue: number;
  actualValue: number;
  forecastError: number;
  forecastErrorPct: number | null;
}

export interface DcfForecastValidationResponse {
  ticker: string;
  comparisons: DcfForecastComparisonResponse[];
  statsByMetric: { metric: DcfForecastMetricValue; stats: DistributionStatsResponse }[];
  methodology: string[];
}

export async function fetchDcfForecastValidation(ticker: string, signal?: AbortSignal): Promise<DcfForecastValidationResponse> {
  const response = await fetch(`/api/research-backtest/dcf-forecast?ticker=${encodeURIComponent(ticker)}`, { signal });
  return parseOrThrow<DcfForecastValidationResponse>(response, 'Failed to load DCF forecast validation.');
}

// ---------------------------------------------------------------------------
// Financial signal validation (spec sections 8, 12)
// ---------------------------------------------------------------------------

export type FinancialSignalTypeValue =
  | 'REVENUE_ACCELERATION'
  | 'REVENUE_DECELERATION'
  | 'MARGIN_EXPANSION'
  | 'MARGIN_CONTRACTION'
  | 'FCF_GROWTH'
  | 'DEBT_REDUCTION'
  | 'GUIDANCE_INCREASE'
  | 'GUIDANCE_DECREASE';

export interface SignalObservationResponse {
  ticker: string;
  signalDate: string;
  label: string;
  forwardOutcomes: ValuationForwardOutcomeResponse[];
  marketCap: number | null;
}

export interface FinancialSignalValidationResponse {
  signal: FinancialSignalTypeValue;
  observations: SignalObservationResponse[];
  statsByHorizon: { horizonMonths: number; stats: DistributionStatsResponse }[];
  methodology: string[];
  robustness?: RobustnessSegmentationResponse;
}

export async function fetchFinancialSignalValidation(
  tickers: string[],
  signal: FinancialSignalTypeValue,
  options: { segment?: boolean } = {},
  abortSignal?: AbortSignal,
): Promise<FinancialSignalValidationResponse> {
  const query = new URLSearchParams({ tickers: tickers.join(','), signal });
  if (options.segment) query.set('segment', 'true');
  const response = await fetch(`/api/research-backtest/financial-signals?${query.toString()}`, { signal: abortSignal });
  return parseOrThrow<FinancialSignalValidationResponse>(response, 'Failed to load financial signal validation.');
}

// ---------------------------------------------------------------------------
// Event study (spec section 9)
// ---------------------------------------------------------------------------

export type EventStudySourceValue = 'EARNINGS_CALL' | 'RESEARCH_EVENT';

export interface EventWindowResultResponse {
  windowLabel: string;
  eventDate: string;
  windowStartDate: string;
  windowEndDate: string;
  stockReturn: number | null;
  benchmarkReturn: number | null;
  abnormalReturn: number | null;
}

export interface EventStudyEventResultResponse {
  ticker: string;
  eventDate: string;
  label: string;
  windows: EventWindowResultResponse[];
}

export interface EventStudyResponse {
  source: EventStudySourceValue;
  benchmarkTicker: string;
  events: EventStudyEventResultResponse[];
  statsByWindow: { windowLabel: string; stats: DistributionStatsResponse }[];
  methodology: string[];
}

export async function fetchEventStudy(
  tickers: string[],
  source: EventStudySourceValue,
  options: { benchmarkTicker?: string; researchEventTypeFilter?: string } = {},
  signal?: AbortSignal,
): Promise<EventStudyResponse> {
  const query = new URLSearchParams({ tickers: tickers.join(','), source });
  if (options.benchmarkTicker) query.set('benchmark', options.benchmarkTicker);
  if (options.researchEventTypeFilter) query.set('researchEventType', options.researchEventTypeFilter);
  const response = await fetch(`/api/research-backtest/events?${query.toString()}`, { signal });
  return parseOrThrow<EventStudyResponse>(response, 'Failed to load the event study.');
}

// ---------------------------------------------------------------------------
// Research event outcome validation (spec sections 10, 12)
// ---------------------------------------------------------------------------

export interface ResearchEventOutcomeResponse {
  eventType: string;
  observations: SignalObservationResponse[];
  statsByHorizon: { horizonMonths: number; stats: DistributionStatsResponse }[];
  methodology: string[];
  robustness?: RobustnessSegmentationResponse;
}

export async function fetchResearchEventOutcomeValidation(
  tickers: string[],
  eventType: string,
  options: { horizonsMonths?: number[]; segment?: boolean } = {},
  signal?: AbortSignal,
): Promise<ResearchEventOutcomeResponse> {
  const query = new URLSearchParams({ tickers: tickers.join(','), eventType });
  if (options.horizonsMonths?.length) query.set('horizons', options.horizonsMonths.join(','));
  if (options.segment) query.set('segment', 'true');
  const response = await fetch(`/api/research-backtest/research-events?${query.toString()}`, { signal });
  return parseOrThrow<ResearchEventOutcomeResponse>(response, 'Failed to load research event outcome validation.');
}

// ---------------------------------------------------------------------------
// Valuation spread analysis (spec section 11)
// ---------------------------------------------------------------------------

export type ValuationSpreadBucketValue = 'DISCOUNT' | 'NEUTRAL' | 'PREMIUM';

export interface ValuationSpreadObservationResponse {
  asOfDate: string;
  companyMultiple: number;
  peerMedianMultiple: number;
  spreadPct: number;
  bucket: ValuationSpreadBucketValue;
  forwardOutcomes: ValuationForwardOutcomeResponse[];
}

export interface ValuationSpreadResponse {
  ticker: string;
  fromDate: string;
  toDate: string;
  sampledDates: number;
  wasCapped: boolean;
  peerDataIsCurrentNotHistorical: true;
  observations: ValuationSpreadObservationResponse[];
  statsByBucket: { bucket: ValuationSpreadBucketValue; horizonMonths: number; stats: DistributionStatsResponse }[];
  methodology: string[];
}

export async function fetchValuationSpreadAnalysis(ticker: string, from: string, to: string, signal?: AbortSignal): Promise<ValuationSpreadResponse> {
  const response = await fetch(`/api/research-backtest/valuation-spread?ticker=${encodeURIComponent(ticker)}&from=${from}&to=${to}`, { signal });
  return parseOrThrow<ValuationSpreadResponse>(response, 'Failed to load valuation spread analysis.');
}

export async function fetchValuationSpreadOutOfSample(
  ticker: string,
  trainFrom: string,
  trainTo: string,
  testFrom: string,
  testTo: string,
  signal?: AbortSignal,
): Promise<TrainTestSplitResponse<ValuationSpreadResponse>> {
  const query = new URLSearchParams({ ticker, mode: 'outOfSample', trainFrom, trainTo, testFrom, testTo });
  const response = await fetch(`/api/research-backtest/valuation-spread?${query.toString()}`, { signal });
  return parseOrThrow(response, 'Failed to load out-of-sample valuation spread analysis.');
}

export async function fetchValuationSpreadWalkForward(
  ticker: string,
  from: string,
  to: string,
  initialTrainYears: number,
  testYears: number,
  signal?: AbortSignal,
): Promise<WalkForwardValidationResponse<ValuationSpreadResponse>> {
  const query = new URLSearchParams({ ticker, mode: 'walkForward', from, to, initialTrainYears: String(initialTrainYears), testYears: String(testYears) });
  const response = await fetch(`/api/research-backtest/valuation-spread?${query.toString()}`, { signal });
  return parseOrThrow(response, 'Failed to load walk-forward valuation spread analysis.');
}
