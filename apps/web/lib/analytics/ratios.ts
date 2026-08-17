/**
 * Pure financial-ratio math — no knowledge of periods, tabs, or React.
 * Every function here follows the same contract:
 *
 *   - Inputs and outputs are `number | null`. `null` means "can't be
 *     computed" (a missing input, a zero/negative denominator that would
 *     divide un-meaningfully, etc.) — never NaN, never Infinity, and never a
 *     value invented to fill the gap. The frontend's job is to render `null`
 *     as "—", not to receive a lie dressed up as a number.
 *   - A ratio-style result (growth, margin) is returned as a plain ratio —
 *     0.15 for "15%", not 15. Multiply by 100 at the point of formatting for
 *     display, the same convention `formatPercent` already expects.
 *   - Negative inputs are never rejected or clamped. A negative margin or a
 *     negative growth rate is real information.
 */

/** Divides two values, returning null instead of NaN/Infinity for any
 * missing input, a zero denominator, or a non-finite result. */
export function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/** (Current / Previous) - 1, as a ratio. Null if either value or the prior
 * period itself is missing, or the prior value is zero (division by a
 * zero base isn't a meaningful growth rate). This is also what "first
 * historical period" resolves to — there is no prior period to compare
 * against, so growth is null, not 0% or infinite. */
export function growthRate(current: number | null, previous: number | null): number | null {
  const ratio = safeDivide(current, previous);
  return ratio === null ? null : ratio - 1;
}

export function grossMargin(grossProfit: number | null, revenue: number | null): number | null {
  return safeDivide(grossProfit, revenue);
}

export function operatingMargin(
  operatingIncome: number | null,
  revenue: number | null,
): number | null {
  return safeDivide(operatingIncome, revenue);
}

export function netMargin(netIncome: number | null, revenue: number | null): number | null {
  return safeDivide(netIncome, revenue);
}

export function fcfMargin(freeCashFlow: number | null, revenue: number | null): number | null {
  return safeDivide(freeCashFlow, revenue);
}

/** Free Cash Flow = Operating Cash Flow − Capital Expenditures. The single
 * definition used everywhere FCF appears — lib/xbrl/normalize.ts calls this
 * at ingestion time so the stored value and this formula never drift apart. */
export function calculateFreeCashFlow(
  operatingCashFlow: number | null,
  capex: number | null,
): number | null {
  if (operatingCashFlow === null || capex === null) return null;
  return operatingCashFlow - capex;
}

/** Sums the parts that are present; null only if every part is missing (not
 * if some are — a company with no short-term debt reported still has a real
 * total-debt figure from its long-term debt alone). */
export function sumOrNull(...values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? present.reduce((total, value) => total + value, 0) : null;
}

export function totalDebt(
  shortTermDebt: number | null,
  longTermDebt: number | null,
): number | null {
  return sumOrNull(shortTermDebt, longTermDebt);
}

/** Net Debt = Total Debt − Cash. Unlike totalDebt, both inputs are required
 * — "debt minus an unknown cash position" isn't a usable figure. */
export function netDebt(totalDebtValue: number | null, cash: number | null): number | null {
  if (totalDebtValue === null || cash === null) return null;
  return totalDebtValue - cash;
}

/** Average of a beginning and ending balance for return-on-X ratios. Falls
 * back to the ending value alone when there's no prior period to average
 * with (the first historical period in a company's data) — a standard,
 * clearly-labeled fallback rather than returning null and hiding a metric
 * that's still informative, just computed on a single balance instead of
 * an average of two. */
export function averageBalance(current: number | null, previous: number | null): number | null {
  if (current === null) return null;
  if (previous === null) return current;
  return (current + previous) / 2;
}

export function roe(
  netIncome: number | null,
  currentEquity: number | null,
  previousEquity: number | null,
): number | null {
  return safeDivide(netIncome, averageBalance(currentEquity, previousEquity));
}

export function roa(
  netIncome: number | null,
  currentAssets: number | null,
  previousAssets: number | null,
): number | null {
  return safeDivide(netIncome, averageBalance(currentAssets, previousAssets));
}

export interface BalanceCheckResult {
  /** True when within tolerance, or when there isn't enough data to check at all. */
  balanced: boolean;
  /** |Assets - (Liabilities + Equity)| as a fraction of Assets, or null if unknown. */
  diffRatio: number | null;
}

const BALANCE_TOLERANCE = 0.01; // 1% of total assets — matches lib/xbrl/validate.ts

/** Assets = Liabilities + Equity, checked for display (not corrected — see
 * lib/xbrl/validate.ts for the ingestion-time version of this same check).
 * Never silently adjusts the numbers; only reports whether they reconcile. */
export function checkBalanceSheetEquation(
  totalAssets: number | null,
  totalLiabilities: number | null,
  stockholdersEquity: number | null,
): BalanceCheckResult {
  if (totalAssets === null || totalLiabilities === null || stockholdersEquity === null) {
    return { balanced: true, diffRatio: null };
  }
  if (totalAssets === 0) {
    return { balanced: true, diffRatio: null };
  }

  const diffRatio = Math.abs(totalAssets - (totalLiabilities + stockholdersEquity)) / totalAssets;
  return { balanced: diffRatio <= BALANCE_TOLERANCE, diffRatio };
}
