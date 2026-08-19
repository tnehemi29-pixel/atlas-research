import { buildCheck, DEFAULT_TOLERANCE_ABSOLUTE_FLOOR, DEFAULT_TOLERANCE_PERCENT, type ReconciliationCheck } from './financialReconciliation';

/**
 * Milestone 14 spec section 8 — market data validation. Same tolerance-based
 * reconciliation discipline as financialReconciliation.ts (reuses its exact
 * `buildCheck` helper rather than a second implementation), applied to the
 * relationships between price, shares outstanding, market cap, debt, cash,
 * and enterprise value.
 */

/** Beyond this many days between the live quote and the filing the
 * shares-outstanding figure comes from, a mismatch is more likely explained
 * by ordinary buyback/issuance activity since that filing than by bad
 * data — the check reports "cannot verify" rather than a false-positive
 * failure. Only applied when both dates are actually known. */
export const MARKET_CAP_STALENESS_THRESHOLD_DAYS = 45;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000);
}

/** Market Cap ≈ Share Price × Shares Outstanding. Market-data tolerance is
 * tighter than financial-statement tolerance by default — these three
 * numbers should come from the same quote snapshot, so a real mismatch is
 * more likely to indicate a stale or wrong shares-outstanding figure than
 * ordinary classification noise.
 *
 * `quoteUpdatedAt`/`filingDate` are optional — when both are supplied and
 * the shares-outstanding figure's filing is significantly older than the
 * live quote, this reports `checkable: false` (the same "cannot verify"
 * result shape financialReconciliation.ts's buildCheck already uses for a
 * missing input) instead of comparing two numbers that were never really
 * from "the same quote snapshot" to begin with — never a numeric failure. */
export function checkMarketCapReconciliation(
  input: {
    sharePrice: number | null;
    sharesOutstanding: number | null;
    marketCap: number | null;
    quoteUpdatedAt?: Date | null;
    filingDate?: Date | null;
  },
  tolerancePercent: number = DEFAULT_TOLERANCE_PERCENT,
): ReconciliationCheck {
  if (input.quoteUpdatedAt && input.filingDate && daysBetween(input.quoteUpdatedAt, input.filingDate) > MARKET_CAP_STALENESS_THRESHOLD_DAYS) {
    return {
      check: 'Market cap (Price × Shares Outstanding)',
      checkable: false,
      passed: false,
      actual: input.marketCap,
      expected: null,
      differenceAbsolute: null,
      differencePercent: null,
      tolerancePercent,
      detail:
        'Market cap (Price × Shares Outstanding): cannot reliably verify — the shares-outstanding figure comes from a filing significantly older than the current market quote, so share count may have changed since then through buybacks or issuance.',
    };
  }

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
