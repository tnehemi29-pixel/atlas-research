import { describe, expect, it } from 'vitest';
import { computeAllImpliedValuationRows, computeImpliedValuationRow, computeMedianImpliedSharePrice } from './impliedValuation';
import type { CompanyValuationMetrics } from './types';

function makeTarget(overrides: Partial<CompanyValuationMetrics> = {}): CompanyValuationMetrics {
  return {
    ticker: 'TARGET',
    name: 'Target Co',
    sector: 'Technology',
    industry: 'Software',
    exchange: 'NASDAQ',
    price: 45,
    marketCap: 4000,
    dilutedSharesOutstanding: 100,
    revenue: 1000,
    revenueGrowth: 0.1,
    ebit: 200,
    ebitda: 250,
    netIncome: 150,
    cash: 100,
    totalDebt: 300,
    bookValue: 1500,
    fiscalYear: 2023,
    filingType: '10-K',
    filingDate: '2024-02-01',
    financialsAsOf: null,
    stale: false,
    ...overrides,
  };
}

describe('computeImpliedValuationRow — hand-verified per methodology', () => {
  const target = makeTarget();

  it('EV/Revenue: 1000 x 3.0 = 3000 EV -> +100 cash -300 debt = 2800 equity -> /100 shares = $28', () => {
    const row = computeImpliedValuationRow('evToRevenue', target, 3.0);
    expect(row.impliedEnterpriseValue).toBe(3000);
    expect(row.impliedEquityValue).toBe(2800);
    expect(row.impliedSharePrice).toBe(28);
    expect(row.upsideDownside).toBeCloseTo(28 / 45 - 1, 9);
    expect(row.isMeaningful).toBe(true);
  });

  it('EV/EBITDA: 250 x 10 = 2500 EV -> 2300 equity -> $23', () => {
    const row = computeImpliedValuationRow('evToEbitda', target, 10);
    expect(row.impliedEnterpriseValue).toBe(2500);
    expect(row.impliedEquityValue).toBe(2300);
    expect(row.impliedSharePrice).toBe(23);
  });

  it('EV/EBIT: 200 x 12 = 2400 EV -> 2200 equity -> $22', () => {
    const row = computeImpliedValuationRow('evToEbit', target, 12);
    expect(row.impliedEnterpriseValue).toBe(2400);
    expect(row.impliedEquityValue).toBe(2200);
    expect(row.impliedSharePrice).toBe(22);
  });

  it('P/E: 150 x 15 = 2250 equity value directly -> $22.50, EV reversed to 2450', () => {
    const row = computeImpliedValuationRow('peRatio', target, 15);
    expect(row.impliedEquityValue).toBe(2250);
    expect(row.impliedSharePrice).toBe(22.5);
    expect(row.impliedEnterpriseValue).toBe(2450); // 2250 - 100 + 300
  });
});

describe('computeImpliedValuationRow — not meaningful cases', () => {
  it('is not meaningful when the peer median multiple is unavailable', () => {
    const row = computeImpliedValuationRow('evToRevenue', makeTarget(), null);
    expect(row.isMeaningful).toBe(false);
    expect(row.impliedSharePrice).toBeNull();
  });

  it('is not meaningful when the target\'s own base metric is missing', () => {
    const row = computeImpliedValuationRow('evToEbitda', makeTarget({ ebitda: null }), 10);
    expect(row.isMeaningful).toBe(false);
  });

  it('is not meaningful when the target has negative earnings, even with a valid peer P/E', () => {
    const row = computeImpliedValuationRow('peRatio', makeTarget({ netIncome: -50 }), 15);
    expect(row.isMeaningful).toBe(false);
    expect(row.impliedSharePrice).toBeNull();
  });

  it('is not meaningful when diluted shares outstanding is missing, even with a valid implied EV', () => {
    const row = computeImpliedValuationRow('evToRevenue', makeTarget({ dilutedSharesOutstanding: null }), 3);
    expect(row.impliedEnterpriseValue).toBe(3000); // EV itself is still computable
    expect(row.impliedSharePrice).toBeNull();
    expect(row.isMeaningful).toBe(false);
  });
});

describe('computeAllImpliedValuationRows + computeMedianImpliedSharePrice', () => {
  const target = makeTarget();
  const rows = computeAllImpliedValuationRows(target, {
    evToRevenue: 3.0,
    evToEbitda: 10,
    evToEbit: 12,
    peRatio: 15,
  });

  it('produces one row per methodology in a stable order', () => {
    expect(rows.map((r) => r.methodology)).toEqual(['evToRevenue', 'evToEbitda', 'evToEbit', 'peRatio']);
  });

  it('median of [28, 23, 22, 22.5] sorted [22, 22.5, 23, 28] = 22.75', () => {
    expect(computeMedianImpliedSharePrice(rows)).toBeCloseTo(22.75, 6);
  });

  it('excludes not-meaningful rows from the median', () => {
    const partialRows = computeAllImpliedValuationRows(makeTarget({ netIncome: -10 }), {
      evToRevenue: 3.0,
      evToEbitda: 10,
      evToEbit: 12,
      peRatio: 15, // P/E will be not-meaningful due to negative net income
    });
    const peRow = partialRows.find((r) => r.methodology === 'peRatio');
    expect(peRow?.isMeaningful).toBe(false);
    // Median now over the 3 remaining meaningful rows: [28, 23, 22] -> median 23
    expect(computeMedianImpliedSharePrice(partialRows)).toBe(23);
  });
});
