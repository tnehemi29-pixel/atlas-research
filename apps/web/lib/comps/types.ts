import type { AssumptionSource } from '@/lib/shared/tagged';

/**
 * The Atlas Research Comparable Company Analysis (CCA) engine — a dedicated,
 * deterministic, pure calculation layer (no React, no Prisma, no fetch),
 * mirroring lib/valuation/'s architecture exactly. Every function here takes
 * plain data in and returns plain data out.
 *
 * Provenance reuses lib/shared/tagged.ts's AssumptionSource rather than
 * inventing a parallel convention — see peer `source` below for where it's
 * genuinely load-bearing (auto-suggested vs. user-added peers).
 */

// ---------------------------------------------------------------------------
// Per-company data snapshot — what Atlas actually knows about a company,
// pulled from the existing companyService (FMP profile/quote) and
// financialDataService (SEC-derived financial statements). Every field is
// either a retrieved actual value or a plainly-derived calculation
// (revenueGrowth, ebitda) — there is no user-editable assumption at this
// layer, so (unlike DcfAssumptions) nothing here needs per-field Tagged<T>:
// the whole snapshot is "actual company data," the same way M5's
// HistoricalYear didn't need per-field tags either.
// ---------------------------------------------------------------------------

export interface CompanyValuationMetrics {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  exchange: string | null;

  price: number | null;
  marketCap: number | null;
  dilutedSharesOutstanding: number | null;

  revenue: number | null;
  /** (Current revenue / prior-year revenue) - 1. Null with only one year of history. */
  revenueGrowth: number | null;
  ebit: number | null;
  /** EBIT + D&A — always derived, never a directly-reported line item. Null
   * when either input is missing; never silently substituted with EBIT or
   * operating cash flow. */
  ebitda: number | null;
  netIncome: number | null;
  cash: number | null;
  totalDebt: number | null;
  /** Stockholders' equity — the denominator for Price/Book. */
  bookValue: number | null;

  /** The fiscal year the above income-statement/balance-sheet figures are drawn from. */
  fiscalYear: number | null;
  filingType: string | null;
  filingDate: string | null;
  /** When the underlying financial statements were last synced from SEC EDGAR. */
  financialsAsOf: string | null;
  /** True if the quote (price/market cap) or financials are a stale cached snapshot. */
  stale: boolean;
}

// ---------------------------------------------------------------------------
// Valuation multiples
// ---------------------------------------------------------------------------

export type MultipleStatus = 'ok' | 'notMeaningful' | 'missingData';

/**
 * A single valuation multiple. `status` is what makes "N/M" ("Not
 * Meaningful") a first-class, structural outcome rather than a UI string
 * guessed from a null value:
 *  - 'missingData': one of the raw inputs (e.g. EBITDA itself) is unavailable.
 *  - 'notMeaningful': every input is known, but the multiple is not a
 *     meaningful figure — a negative or zero denominator (negative EBITDA,
 *     negative earnings, zero revenue).
 *  - 'ok': a genuine, displayable multiple.
 * `value` is only non-null when status is 'ok'.
 */
export interface Multiple {
  value: number | null;
  status: MultipleStatus;
}

export interface CompanyMultiples {
  ticker: string;
  /** Enterprise Value = Market Cap + Total Debt − Cash. Null if any input is missing. */
  enterpriseValue: number | null;
  /** Equity Value at market — i.e. market capitalization, restated here for
   * symmetry with enterpriseValue so both "sides" of the multiples table
   * share one obvious numerator field. */
  equityValue: number | null;
  evToRevenue: Multiple;
  evToEbitda: Multiple;
  evToEbit: Multiple;
  peRatio: Multiple;
  priceToSales: Multiple;
  priceToBook: Multiple;
}

// ---------------------------------------------------------------------------
// Peer similarity scoring — see peerScoring.ts for the exact formula. Every
// component score is a normalized 0-1 similarity (1 = identical/very close),
// combined into a single 0-100 total via documented, fixed weights — never
// an opaque or invented number.
// ---------------------------------------------------------------------------

export interface SimilarityWeights {
  industry: number;
  revenue: number;
  marketCap: number;
  growth: number;
  margin: number;
}

export interface SimilarityScoreBreakdown {
  industryScore: number;
  revenueScore: number;
  marketCapScore: number;
  growthScore: number;
  marginScore: number;
  /** Weighted sum of the above, 0-100. */
  totalScore: number;
  /** Which component scores could actually be computed (false when the
   * target or candidate was missing the underlying data for that
   * dimension) — surfaced in the UI so a score isn't mistaken for a
   * complete comparison when, say, growth couldn't be evaluated. */
  computed: {
    industry: boolean;
    revenue: boolean;
    marketCap: boolean;
    growth: boolean;
    margin: boolean;
  };
}

export interface PeerCandidate {
  metrics: CompanyValuationMetrics;
  score: SimilarityScoreBreakdown;
}

// ---------------------------------------------------------------------------
// The selected comp set — every peer the user has actually chosen to
// include, each tagged with how it got there.
// ---------------------------------------------------------------------------

/** What the caller (the UI, via runComps' params) supplies for each selected
 * peer — everything EXCEPT the multiples, which the engine always computes
 * fresh from `metrics` rather than trusting a caller-supplied value. */
export interface PeerSelection {
  metrics: CompanyValuationMetrics;
  score: SimilarityScoreBreakdown | null;
  /** 'calculated' = suggested by the peer-screening algorithm and accepted;
   * 'user' = manually searched for and added. Both are equally valid peers —
   * this is provenance, not a quality signal. */
  source: AssumptionSource;
  /** User-controlled: excluded from the statistics/implied-valuation
   * calculations (e.g. a flagged outlier) without being removed from the
   * table — "never hide excluded companies." */
  excluded: boolean;
}

/** A PeerSelection plus its engine-computed multiples — what `runComps`
 * actually returns for each peer. */
export interface SelectedPeer extends PeerSelection {
  multiples: CompanyMultiples;
}

// ---------------------------------------------------------------------------
// Cross-peer statistics
// ---------------------------------------------------------------------------

export interface StatSummary {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
}

export interface OutlierAnalysis {
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  /** Tickers whose value for this multiple falls outside [lowerBound, upperBound]. */
  outlierTickers: string[];
}

export type MultipleKey = 'evToRevenue' | 'evToEbitda' | 'evToEbit' | 'peRatio';

export interface MultipleStatistics {
  /** Every included (non-excluded) peer's 'ok' values for this multiple. */
  raw: StatSummary;
  /** Statistically-flagged potential outliers, computed from `raw`. */
  outliers: OutlierAnalysis;
  /** Same as `raw` but additionally excluding statistically-flagged outliers
   * AND any peer the user has manually excluded. */
  adjusted: StatSummary;
}

// ---------------------------------------------------------------------------
// Implied valuation
// ---------------------------------------------------------------------------

export interface ImpliedValuationRow {
  methodology: MultipleKey;
  label: string;
  /** The peer statistic actually used (adjusted median). Null if not meaningful. */
  medianMultiple: number | null;
  impliedEnterpriseValue: number | null;
  impliedEquityValue: number | null;
  impliedSharePrice: number | null;
  upsideDownside: number | null;
  /** False when the target's own input for this methodology is missing/N.M.,
   * or the peer median itself couldn't be computed — the row is still shown,
   * just with nulls, rather than removed (never "hide the unavailable case"). */
  isMeaningful: boolean;
}

export interface PeerQualitySummary {
  peerCount: number;
  medianRevenue: number | null;
  medianMarketCap: number | null;
  medianGrowth: number | null;
  medianEbitdaMargin: number | null;
}

export interface CompsResult {
  target: CompanyValuationMetrics;
  targetMultiples: CompanyMultiples;
  peers: SelectedPeer[];
  statistics: Record<MultipleKey, MultipleStatistics>;
  impliedValuation: ImpliedValuationRow[];
  /** Median of every meaningful row's implied share price — the single
   * "one number" a reader is likely to want, clearly labeled as a median
   * across methodologies, not a blend of them. */
  medianImpliedSharePrice: number | null;
  peerQuality: PeerQualitySummary;
}
