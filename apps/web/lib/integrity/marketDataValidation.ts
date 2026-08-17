import { buildCheck, DEFAULT_TOLERANCE_ABSOLUTE_FLOOR, DEFAULT_TOLERANCE_PERCENT, type ReconciliationCheck } from './financialReconciliation';

/**
 * Milestone 14 spec section 8 — market data validation. Same tolerance-based
 * reconciliation discipline as financialReconciliation.ts (reuses its exact
 * `buildCheck` helper rather than a second implementation), applied to the
 * relationships between price, shares outstanding, market cap, debt, cash,
 * and enterprise value.
 */

/** Market Cap ≈ Share Price × Shares Outstanding. Market-data tolerance is
 * tighter than financial-statement tolerance by default — these three
 * numbers should come from the same quote snapshot, so a real mismatch is
 * more likely to indicate a stale or wrong shares-outstanding figure than
 * ordinary classification noise. */
export function checkMarketCapReconciliation(
  input: { sharePrice: number | null; sharesOutstanding: number | null; marketCap: number | null },
  tolerancePercent: number = DEFAULT_TOLERANCE_PERCENT,
): ReconciliationCheck {
  const expected = input.sharePrice !== null && input.sharesOutstanding !== null ? input.sharePrice * input.sharesOutstanding : null;
  return buildCheck('Market cap (Price × Shares Outstanding)', input.marketCap, expected, tolerancePercent, DEFAULT_TOLERANCE_ABSOLUTE_FLOOR);
}

/** Enterprise Value ≈ Market Cap + Debt - Cash. */
export function checkEnterpriseValueReconciliation(
  input: { marketCap: number | null; totalDebt: number | null; cashAndEquivalents: number | null; enterpriseValue: number | null },
  tolerancePercent: number = DEFAULT_TOLERANCE_PERCENT,
): ReconciliationCheck {
  const expected =
    input.marketCap !== null && input.totalDebt !== null && input.cashAndEquivalents !== null ? input.marketCap + input.totalDebt - input.cashAndEquivalents : null;
  return buildCheck('Enterprise value (Market Cap + Debt - Cash)', input.enterpriseValue, expected, tolerancePercent, DEFAULT_TOLERANCE_ABSOLUTE_FLOOR);
}

export function runMarketDataValidation(input: {
  sharePrice: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  totalDebt: number | null;
  cashAndEquivalents: number | null;
  enterpriseValue: number | null;
}): ReconciliationCheck[] {
  return [checkMarketCapReconciliation(input), checkEnterpriseValueReconciliation(input)];
}
