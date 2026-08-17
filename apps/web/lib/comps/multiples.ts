import type { CompanyMultiples, CompanyValuationMetrics, Multiple } from './types';

/**
 * Enterprise Value and every valuation multiple, computed independently of
 * any UI. `computeMultiple` is the one place "N/M" (Not Meaningful) is
 * decided — every multiple below routes through it rather than each
 * re-implementing its own zero/negative-denominator check.
 */

/** Enterprise Value = Market Cap + Total Debt − Cash. Requires all three
 * actual inputs — never assumes a missing debt/cash figure is zero. */
export function computeEnterpriseValue(
  marketCap: number | null,
  totalDebt: number | null,
  cash: number | null,
): number | null {
  if (marketCap === null || totalDebt === null || cash === null) return null;
  return marketCap + totalDebt - cash;
}

/**
 * A generic multiple = numerator / denominator, with N/M handling:
 *  - either input missing -> 'missingData' (nothing to compute at all)
 *  - denominator <= 0 -> 'notMeaningful' (negative/zero EBITDA, earnings,
 *    revenue, or book value all make the ratio uninterpretable, not just
 *    negative — this is the standard equity-research convention, not a
 *    judgment call made per-metric)
 *  - otherwise -> 'ok'
 * The numerator's sign is never checked — a negative enterprise value (a
 * huge net-cash position) is unusual but still a real, meaningful multiple.
 */
export function computeMultiple(numerator: number | null, denominator: number | null): Multiple {
  if (numerator === null || denominator === null) return { value: null, status: 'missingData' };
  if (denominator <= 0) return { value: null, status: 'notMeaningful' };

  const value = numerator / denominator;
  if (!Number.isFinite(value)) return { value: null, status: 'notMeaningful' };
  return { value, status: 'ok' };
}

export function evToRevenueMultiple(enterpriseValue: number | null, revenue: number | null): Multiple {
  return computeMultiple(enterpriseValue, revenue);
}

export function evToEbitdaMultiple(enterpriseValue: number | null, ebitda: number | null): Multiple {
  return computeMultiple(enterpriseValue, ebitda);
}

export function evToEbitMultiple(enterpriseValue: number | null, ebit: number | null): Multiple {
  return computeMultiple(enterpriseValue, ebit);
}

export function peMultiple(equityValue: number | null, netIncome: number | null): Multiple {
  return computeMultiple(equityValue, netIncome);
}

export function priceToSalesMultiple(equityValue: number | null, revenue: number | null): Multiple {
  return computeMultiple(equityValue, revenue);
}

export function priceToBookMultiple(equityValue: number | null, bookValue: number | null): Multiple {
  return computeMultiple(equityValue, bookValue);
}

/** Assembles every multiple for one company from its metrics snapshot — the
 * single function both the target and every peer are run through, so the
 * target is never scored by a different formula than its peers. */
export function computeCompanyMultiples(metrics: CompanyValuationMetrics): CompanyMultiples {
  const enterpriseValue = computeEnterpriseValue(metrics.marketCap, metrics.totalDebt, metrics.cash);
  const equityValue = metrics.marketCap;

  return {
    ticker: metrics.ticker,
    enterpriseValue,
    equityValue,
    evToRevenue: evToRevenueMultiple(enterpriseValue, metrics.revenue),
    evToEbitda: evToEbitdaMultiple(enterpriseValue, metrics.ebitda),
    evToEbit: evToEbitMultiple(enterpriseValue, metrics.ebit),
    peRatio: peMultiple(equityValue, metrics.netIncome),
    priceToSales: priceToSalesMultiple(equityValue, metrics.revenue),
    priceToBook: priceToBookMultiple(equityValue, metrics.bookValue),
  };
}
