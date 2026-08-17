import { defaultRoundTripCostBps } from './backtestConfig';

/**
 * Return arithmetic shared by every Milestone 12 analysis — absolute
 * return, benchmark-relative/excess return, and the transaction-cost
 * netting spec section 17 requires ("do not assume zero friction
 * automatically"). Kept separate from lib/analytics/ratios.ts's
 * growthRate (used for the raw price-to-price return itself, in
 * lib/services/historicalPriceService.ts) since these functions operate on
 * an already-computed return, not raw prices.
 */

/** Asset return minus benchmark return over the same window — the
 * "did this beat the market" figure spec section 5 calls "excess return."
 * Null propagates if either input is unavailable, never a silent 0. */
export function excessReturn(assetReturnPct: number | null, benchmarkReturnPct: number | null): number | null {
  if (assetReturnPct === null || benchmarkReturnPct === null) return null;
  return assetReturnPct - benchmarkReturnPct;
}

/**
 * Nets a round-trip transaction cost (commission + slippage, in basis
 * points) out of a single buy-then-sell return observation. Applied by
 * default with a conservative non-zero cost (see
 * DEFAULT_TRANSACTION_COST_BPS) — a caller must explicitly pass 0 to see
 * the frictionless figure, matching spec section 17's "do not assume zero
 * friction automatically."
 */
export function applyTransactionCosts(returnPct: number, costBps: number = defaultRoundTripCostBps()): number {
  return returnPct - costBps / 10_000;
}
