/**
 * The normalized research context — the ONLY thing lib/ai/generateResearchReport.ts
 * ever sees. Built entirely from already-computed/already-stored data (never
 * raw Prisma rows, never a fresh external API call beyond what the reused
 * services already do): company profile, financial statements, a fresh
 * (pure, unpersisted) run of the DCF and comps engines, and the LATEST
 * already-generated SEC-filing and earnings-call analyses. Every fact the
 * model could cite is paired with a `sourceId` pointing into `sources` — a
 * backend-built, closed registry the model may reference but never extend.
 */

export type ResearchSourceType =
  | 'SEC_FILING'
  | 'EARNINGS_CALL'
  | 'FINANCIAL_STATEMENT'
  | 'DCF_MODEL'
  | 'COMPS_MODEL'
  | 'MARKET_DATA';

export interface ResearchSource {
  /** 1-based, stable within one report generation — this is the ID the AI
   * cites and the ID the UI resolves back to a source card. */
  id: number;
  type: ResearchSourceType;
  /** e.g. "SEC 10-K, filed February 15, 2026" or "Q2 2026 Earnings Call". */
  label: string;
  detail?: string | null;
  secFilingId?: string;
  earningsCallId?: string;
}

export interface ResearchCompanyOverview {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  country: string | null;
  price: number | null;
  marketCap: number | null;
  /** marketCap + totalDebt - cash, computed from the latest annual period —
   * null when any input is missing, never estimated. */
  enterpriseValue: number | null;
  beta: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  quoteStale: boolean;
}

export type FinancialChangeKind = 'growth' | 'points';

export interface ResearchFinancialMetricSeries {
  label: string;
  changeKind: FinancialChangeKind;
  /** Oldest first. */
  values: Array<{ fiscalYear: number; value: number | null }>;
  latestYoyChange: number | null;
}

export interface ResearchFinancialPerformance {
  periodType: 'annual';
  metrics: ResearchFinancialMetricSeries[];
  dataAsOf: string | null;
  stale: boolean;
  sourceId: number;
}

export interface ResearchDcfScenario {
  label: 'Bear' | 'Base' | 'Bull';
  finalYearRevenue: number | null;
  finalYearOperatingMargin: number | null;
  finalYearUnleveredFcf: number | null;
  wacc: number | null;
  terminalGrowthRate: number | null;
  /** PV of terminal value / enterprise value — null if EV is null or zero. */
  terminalValueSharePct: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  impliedSharePrice: number | null;
  upsideDownside: number | null;
  isValid: boolean;
  issues: string[];
}

export interface ResearchDcfAnalysis {
  currentSharePrice: number | null;
  forecastYears: number;
  scenarios: ResearchDcfScenario[];
  sourceId: number;
}

export interface ResearchCompsMultiples {
  evToRevenue: number | null;
  evToEbitda: number | null;
  evToEbit: number | null;
  peRatio: number | null;
}

export interface ResearchCompsPeer {
  ticker: string;
  name: string;
  multiples: ResearchCompsMultiples;
}

export interface ResearchCompsAnalysis {
  targetMultiples: ResearchCompsMultiples;
  peerMedianMultiples: ResearchCompsMultiples;
  peers: ResearchCompsPeer[];
  impliedSharePrice: number | null;
  upsideDownside: number | null;
  sourceId: number;
}

export interface ResearchSecAnalysisSnapshot {
  summary: string;
  keyChanges: string[];
  risks: Array<{ description: string; category: string }>;
  managementCommentary: string[];
  capitalAllocation: string[];
  accountingChanges: string[];
}

export interface ResearchSecFilingContext {
  filing: { id: string; formType: string; filingDate: string; periodEnd: string | null };
  analysis: ResearchSecAnalysisSnapshot | null;
  sourceId: number;
}

export interface ResearchEarningsAnalysisSnapshot {
  summary: string;
  businessTrends: Array<{ description: string; category: string }>;
  risks: Array<{ description: string; category: string }>;
  capitalAllocation: Array<{ description: string; category: string }>;
  managementLanguage: Array<{ dimension: string; level: string; observation: string }>;
}

export interface ResearchGuidanceObservation {
  metricLabel: string;
  period: string;
  low: number | null;
  high: number | null;
  midpoint: number | null;
  change: string;
}

export interface ResearchEarningsContext {
  call: { id: string; fiscalYear: number; fiscalQuarter: number; callDate: string | null };
  analysis: ResearchEarningsAnalysisSnapshot | null;
  guidance: ResearchGuidanceObservation[];
  sourceId: number;
}

export interface ResearchKeyMetric {
  label: string;
  /** Pre-formatted for display, e.g. "$416.16B" or "+6.43%" — the aggregator
   * owns formatting so the LLM never touches a number. */
  value: string;
  sourceId: number | null;
}

export interface ResearchContext {
  ticker: string;
  companyOverview: ResearchCompanyOverview;
  financialPerformance: ResearchFinancialPerformance;
  dcfAnalysis: ResearchDcfAnalysis | null;
  compsAnalysis: ResearchCompsAnalysis | null;
  secFilingContext: ResearchSecFilingContext | null;
  earningsContext: ResearchEarningsContext | null;
  keyMetrics: ResearchKeyMetric[];
  sources: ResearchSource[];
  /** ISO timestamp — when this context was assembled; stored as the
   * report's dataSnapshotAt and shown as "Research data through: [date]". */
  dataSnapshotAt: string;
  /** Human-readable notes about what couldn't be gathered (e.g. "No SEC
   * filings found", "Comps data unavailable") — surfaced in the report's
   * freshness/limitations area, never silently dropped. */
  warnings: string[];
}
