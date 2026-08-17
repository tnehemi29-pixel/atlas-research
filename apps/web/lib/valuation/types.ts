/**
 * The Atlas Research DCF engine — a dedicated, deterministic, pure
 * calculation layer (no React, no Prisma, no fetch). Every function in
 * lib/valuation/ takes plain data in and returns plain data out, so the
 * whole engine is testable without a browser or a database.
 *
 * `Tagged<T>` is the load-bearing type of the whole module: every number the
 * UI displays is wrapped with where it came from, so "actual company data,"
 * "a value we calculated," and "a number the user typed in" are never
 * visually or structurally ambiguous. Nothing in this engine ever invents a
 * value and reports it as one of the other three kinds.
 */

// Provenance (Tagged<T>) and validation types now live in lib/shared/tagged.ts
// so lib/comps/ (Milestone 6) can reuse the identical convention — re-exported
// here unchanged so every existing import from './types' keeps working.
import type { AssumptionSource, Tagged, ValidationIssue, ValidationSeverity } from '@/lib/shared/tagged';
export type { AssumptionSource, Tagged, ValidationIssue, ValidationSeverity };
export { tag } from '@/lib/shared/tagged';

// ---------------------------------------------------------------------------
// Historical period (derived from Milestone 3/4's normalized financial data)
// ---------------------------------------------------------------------------

export interface HistoricalYear {
  fiscalYear: number;
  revenue: number | null;
  revenueGrowth: number | null;
  ebit: number | null;
  ebitMargin: number | null;
  /** Effective tax rate, outlier-bounded — see historicals.ts. Null when unusable. */
  taxRate: number | null;
  da: number | null;
  /** Positive magnitude — a cash outflow. Always subtracted, never negated in storage. */
  capex: number | null;
  /** Operating net working capital level: (CurrentAssets - Cash) - (CurrentLiabilities - ShortTermDebt). */
  nwc: number | null;
  changeInNwc: number | null;
  /** Computed with the identical formula as forecast years — see fcf.ts — so history and forecast are directly comparable. */
  unleveredFcf: number | null;
}

// ---------------------------------------------------------------------------
// Forecast assumptions (user/calculated inputs that drive the projection)
// ---------------------------------------------------------------------------

export type RevenueForecastMethod = 'historicalGrowth' | 'userGrowth' | 'fade';

export interface RevenueAssumptions {
  method: RevenueForecastMethod;
  /** 'userGrowth': one ratio per forecast year, e.g. [0.08, 0.07, 0.06, 0.05, 0.04]. */
  userGrowthRates: number[];
  /** 'fade': linear interpolation from this rate... */
  fadeStartGrowth: number;
  /** ...down (or up) to this rate by the final forecast year. */
  fadeEndGrowth: number;
}

export type MarginMethod = 'historicalAverage' | 'user' | 'gradual';

export interface MarginAssumptions {
  method: MarginMethod;
  userMargin: number;
  gradualStartMargin: number;
  gradualEndMargin: number;
}

export type RateMethod = 'historical' | 'user';

export interface TaxAssumptions {
  method: RateMethod;
  userRate: number;
}

/**
 * Shared by D&A, CapEx, and the NWC level — three ways to project a driver
 * that (usually) scales with revenue:
 *  - 'historicalAverage': % of revenue = the average of available historical years (calculated).
 *  - 'percentOfRevenue':  % of revenue = a value the user sets directly.
 *  - 'flatAmount':        a constant dollar amount every forecast year, not scaled by revenue at all —
 *                          for a driver that doesn't track revenue (e.g. a fixed, lumpy capex program).
 */
export type DriverMethod = 'historicalAverage' | 'percentOfRevenue' | 'flatAmount';

export interface DriverAssumptions {
  method: DriverMethod;
  percentOfRevenue: number;
  flatAmount: number;
}

export interface WaccAssumptions {
  riskFreeRate: number;
  equityRiskPremium: number;
  beta: number;
  /** Whether `beta` currently reflects FMP's estimate or a user-entered
   * value — tracked explicitly by whoever constructs/edits this object
   * (buildDefaultAssumptions sets it, the UI flips it to 'user' the moment
   * the field is edited) rather than re-derived by comparing floats. */
  betaSource: 'estimate' | 'user';
  costOfDebtMethod: RateMethod;
  costOfDebtUser: number;
  /**
   * Market capitalization, when the user supplies it directly instead of
   * relying on the retrieved value in `DcfMarketData` — the "if data
   * unavailable, allow the user to provide it" path for the one WACC input
   * most likely to be missing without a market-data provider configured.
   * `undefined`/`null` means "no override, use the retrieved value" so every
   * existing assumptions object built before this field existed still works
   * unchanged.
   */
  marketCapOverride?: number | null;
}

export type TerminalValueMethod = 'perpetuityGrowth' | 'exitMultiple';

export interface TerminalValueAssumptions {
  method: TerminalValueMethod;
  perpetuityGrowthRate: number;
  exitMultiple: number;
}

export type ForecastHorizon = 3 | 5 | 7 | 10;

export interface DcfAssumptions {
  forecastYears: ForecastHorizon;
  revenue: RevenueAssumptions;
  margin: MarginAssumptions;
  tax: TaxAssumptions;
  da: DriverAssumptions;
  capex: DriverAssumptions;
  nwc: DriverAssumptions;
  wacc: WaccAssumptions;
  terminalValue: TerminalValueAssumptions;
}

// ---------------------------------------------------------------------------
// Market data — what we actually know about the company vs. what the user
// must supply for a WACC calculation to be possible.
// ---------------------------------------------------------------------------

export interface DcfMarketData {
  currentSharePrice: number | null;
  marketCapitalization: number | null;
  totalDebt: number | null;
  cash: number | null;
  dilutedSharesOutstanding: number | null;
  beta: number | null;
  /** Latest historical interest expense — used to calculate a default pre-tax cost of debt. */
  interestExpense: number | null;
}

// ---------------------------------------------------------------------------
// Forecast + valuation outputs
// ---------------------------------------------------------------------------

export interface ForecastYear {
  yearIndex: number;
  fiscalYear: number;
  revenueGrowth: number;
  revenue: number;
  ebitMargin: number;
  ebit: number;
  taxRate: number;
  nopat: number;
  da: number;
  capex: number;
  nwc: number;
  changeInNwc: number;
  unleveredFcf: number;
  discountFactor: number;
  presentValueOfFcf: number;
}

export interface WaccResult {
  riskFreeRate: Tagged<number>;
  equityRiskPremium: Tagged<number>;
  beta: Tagged<number>;
  costOfEquity: Tagged<number>;
  preTaxCostOfDebt: Tagged<number | null>;
  effectiveTaxRate: Tagged<number | null>;
  afterTaxCostOfDebt: Tagged<number | null>;
  marketCapitalization: Tagged<number | null>;
  totalDebt: Tagged<number | null>;
  equityWeight: Tagged<number | null>;
  debtWeight: Tagged<number | null>;
  wacc: Tagged<number | null>;
}

export interface TerminalValueResult {
  method: TerminalValueMethod;
  undiscountedValue: number | null;
  presentValue: number | null;
  /** Cross-check: what EV/EBITDA multiple the perpetuity-growth TV implies, for sanity-checking. */
  impliedExitMultiple: number | null;
  /** Cross-check: what perpetuity growth rate the exit-multiple TV implies. */
  impliedPerpetuityGrowth: number | null;
}

export interface DcfResult {
  historicals: HistoricalYear[];
  forecast: ForecastYear[];
  wacc: WaccResult;
  terminalValue: TerminalValueResult;
  pvOfForecastFcf: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  impliedSharePrice: number | null;
  currentSharePrice: number | null;
  upsideDownside: number | null;
  issues: ValidationIssue[];
  /** False when a blocking ERROR issue is present — in that case the value
   * fields above are null rather than a number computed from invalid inputs. */
  isValid: boolean;
}
