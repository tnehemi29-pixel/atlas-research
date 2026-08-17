/**
 * The ONE place every Milestone 12 threshold lives — same discipline as
 * Milestone 11's lib/researchEvents/materialityConfig.ts. No backtest
 * module inlines its own magic number, and none of these values is ever
 * fit or tuned against a testing period (spec section 18: "No strategy
 * optimization" — these are fixed, disclosed methodology choices, not
 * parameters a user or Atlas searches over).
 */

/** Below this many observations, every statistic except the count itself
 * is withheld and the UI shows "Insufficient observations for meaningful
 * statistical inference" instead of a number that would imply more
 * confidence than the sample supports. */
export const MIN_OBSERVATIONS_FOR_STATS = 5;

export const INSUFFICIENT_OBSERVATIONS_MESSAGE = 'Insufficient observations for meaningful statistical inference.';

/** 95% two-sided normal-approximation multiplier (mean ± z * standard
 * error). A normal approximation, not a t-distribution — documented as an
 * approximation in docs/backtesting.md; adequate given results are already
 * withheld below MIN_OBSERVATIONS_FOR_STATS. */
export const CONFIDENCE_Z_95 = 1.96;

/** "At minimum support S&P 500" — FMP's free-tier historical data covers
 * SPY (the SPDR S&P 500 ETF trust) far more reliably than the raw ^GSPC
 * index, so SPY is used as the practical S&P 500 proxy. Always labeled as
 * such in the UI, never presented as the index itself. */
export const DEFAULT_BENCHMARK_TICKER = 'SPY';

export const FORWARD_RETURN_HORIZONS_MONTHS = [1, 3, 6, 12] as const;
export type ForwardReturnHorizonMonths = (typeof FORWARD_RETURN_HORIZONS_MONTHS)[number];

export interface EventWindowConfig {
  label: string;
  preDays: number;
  postDays: number;
}

/** Trading-day (not calendar-day) windows — see lib/backtest/eventStudy.ts. */
export const EVENT_STUDY_WINDOWS: EventWindowConfig[] = [
  { label: '[-1,+1]', preDays: 1, postDays: 1 },
  { label: '[-3,+3]', preDays: 3, postDays: 3 },
  { label: '[-5,+5]', preDays: 5, postDays: 5 },
];

/** Round-trip transaction-cost default for any return figure derived from
 * an implied buy-then-sell pair (a signal observation's forward return).
 * "Default should be conservative and clearly disclosed. Do not assume
 * zero friction automatically" — 10bps commission + 10bps slippage, always
 * netted in unless a caller explicitly overrides it to 0. */
export const DEFAULT_TRANSACTION_COST_BPS = { commissionBps: 10, slippageBps: 10 };

export function defaultRoundTripCostBps(): number {
  return DEFAULT_TRANSACTION_COST_BPS.commissionBps + DEFAULT_TRANSACTION_COST_BPS.slippageBps;
}

/** A spread at or beyond ±15% of the peer median is classified Discount/
 * Premium; anything narrower is Neutral. Configurable per spec section 11
 * ("use configurable thresholds") — these are only the defaults. */
export const VALUATION_SPREAD_THRESHOLDS = { discountAt: -0.15, premiumAt: 0.15 };

/** Market-cap buckets for robustness segmentation (spec section 12). */
export const MARKET_CAP_BUCKETS = [
  { label: 'Small (<$2B)', maxMarketCap: 2_000_000_000 },
  { label: 'Mid ($2B-$10B)', maxMarketCap: 10_000_000_000 },
  { label: 'Large ($10B-$200B)', maxMarketCap: 200_000_000_000 },
  { label: 'Mega (>$200B)', maxMarketCap: Infinity },
] as const;
