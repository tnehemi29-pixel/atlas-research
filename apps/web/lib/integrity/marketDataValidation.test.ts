import { describe, expect, it } from 'vitest';
import { checkEnterpriseValueReconciliation, checkMarketCapReconciliation, runMarketDataValidation } from './marketDataValidation';

describe('checkMarketCapReconciliation', () => {
  it('passes when Market Cap = Price × Shares', () => {
    const result = checkMarketCapReconciliation({ sharePrice: 150, sharesOutstanding: 10_000_000, marketCap: 1_500_000_000 });
    expect(result.checkable).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('fails on a material mismatch', () => {
    const result = checkMarketCapReconciliation({ sharePrice: 150, sharesOutstanding: 10_000_000, marketCap: 2_000_000_000 });
    expect(result.passed).toBe(false);
  });

  it('is not checkable without shares outstanding', () => {
    const result = checkMarketCapReconciliation({ sharePrice: 150, sharesOutstanding: null, marketCap: 1_500_000_000 });
    expect(result.checkable).toBe(false);
  });
});

describe('checkEnterpriseValueReconciliation', () => {
  it('passes when EV = Market Cap + Debt - Cash', () => {
    const result = checkEnterpriseValueReconciliation({ marketCap: 1_500_000_000, totalDebt: 200_000_000, cashAndEquivalents: 100_000_000, enterpriseValue: 1_600_000_000 });
    expect(result.passed).toBe(true);
  });

  it('fails on a material mismatch', () => {
    const result = checkEnterpriseValueReconciliation({ marketCap: 1_500_000_000, totalDebt: 200_000_000, cashAndEquivalents: 100_000_000, enterpriseValue: 2_000_000_000 });
    expect(result.passed).toBe(false);
  });
});

describe('runMarketDataValidation', () => {
  it('runs both checks together', () => {
    const results = runMarketDataValidation({
      sharePrice: 150,
      sharesOutstanding: 10_000_000,
      marketCap: 1_500_000_000,
      totalDebt: 200_000_000,
      cashAndEquivalents: 100_000_000,
      enterpriseValue: 1_600_000_000,
    });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.passed)).toBe(true);
  });
});
