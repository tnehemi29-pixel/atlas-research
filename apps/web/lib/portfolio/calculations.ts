/**
 * Pure portfolio math — no I/O, no Prisma, no fetch. Every function here
 * takes plain numbers in and returns a plain number (or null) out, mirroring
 * lib/comps/multiples.ts's and lib/valuation/'s own "the engine never
 * touches a database" discipline. Milestone 10's spec formulas, verbatim:
 *
 *   Market Value          = Shares × Current Price
 *   Cost Basis             = Shares × Average Cost
 *   Unrealized Gain/Loss   = Market Value − Cost Basis
 *   Unrealized Return      = Unrealized Gain/Loss / Cost Basis
 *   Portfolio Weight       = Holding Market Value / Total Portfolio Market Value
 */

/** Null when the current price is unavailable — never silently substitutes
 * cost basis or zero, which would understate a real data gap as a real number. */
export function marketValue(shares: number, currentPrice: number | null): number | null {
  if (currentPrice === null) return null;
  return shares * currentPrice;
}

export function costBasisOf(shares: number, averageCost: number): number {
  return shares * averageCost;
}

export function unrealizedGainLoss(marketValueAmount: number | null, costBasisAmount: number): number | null {
  if (marketValueAmount === null) return null;
  return marketValueAmount - costBasisAmount;
}

/** A zero cost basis (e.g. gifted/spun-off shares with no recorded cost)
 * makes the return mathematically undefined, not infinite — returns null
 * rather than Infinity/NaN, which the UI renders as "—", never a garbage number. */
export function unrealizedReturn(gainLoss: number | null, costBasisAmount: number): number | null {
  if (gainLoss === null) return null;
  if (costBasisAmount === 0) return null;
  return gainLoss / costBasisAmount;
}

/** Null when the total is unknown or zero (an empty portfolio has no
 * meaningful weights) — never divides by zero. */
export function portfolioWeight(holdingMarketValue: number | null, totalMarketValue: number | null): number | null {
  if (holdingMarketValue === null || totalMarketValue === null || totalMarketValue === 0) return null;
  return holdingMarketValue / totalMarketValue;
}

export interface WeightedInput {
  value: number | null;
  weight: number | null;
}

/** Market-value-weighted average of a metric across holdings (Milestone
 * 10's "Weighted Revenue Growth," "Weighted EV/EBITDA," etc.) — a holding
 * missing either the metric itself or its weight is skipped entirely rather
 * than treated as zero, which would silently drag the average toward a
 * number that isn't actually supported by data. Returns null only when
 * NO holding could contribute (never a meaningless 0). */
export function weightedAverage(items: WeightedInput[]): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    if (item.value === null || item.weight === null || item.weight <= 0) continue;
    weightedSum += item.value * item.weight;
    totalWeight += item.weight;
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}
