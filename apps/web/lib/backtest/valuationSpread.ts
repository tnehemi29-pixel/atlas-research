import { VALUATION_SPREAD_THRESHOLDS } from './backtestConfig';

/**
 * Buckets a company's multiple against its peer median (spec section 11).
 * Worked example: company EV/EBITDA 12x, peer median 18x ->
 * 12/18 - 1 = -33.3% -> Discount. Thresholds are configurable (a caller may
 * pass its own) but default to the centralized backtestConfig.ts values —
 * never hardcoded a second time here.
 */

export type ValuationSpreadBucket = 'DISCOUNT' | 'NEUTRAL' | 'PREMIUM';

export interface ValuationSpreadClassification {
  spreadPct: number;
  bucket: ValuationSpreadBucket;
}

export function classifyValuationSpread(
  companyMultiple: number,
  peerMedianMultiple: number,
  thresholds: { discountAt: number; premiumAt: number } = VALUATION_SPREAD_THRESHOLDS,
): ValuationSpreadClassification | null {
  if (peerMedianMultiple === 0 || !Number.isFinite(companyMultiple) || !Number.isFinite(peerMedianMultiple)) return null;

  const spreadPct = companyMultiple / peerMedianMultiple - 1;
  let bucket: ValuationSpreadBucket = 'NEUTRAL';
  if (spreadPct <= thresholds.discountAt) bucket = 'DISCOUNT';
  else if (spreadPct >= thresholds.premiumAt) bucket = 'PREMIUM';

  return { spreadPct, bucket };
}
