import { describe, expect, it } from 'vitest';
import {
  computeCompanyMultiples,
  computeEnterpriseValue,
  computeMultiple,
  evToEbitMultiple,
  evToEbitdaMultiple,
  evToRevenueMultiple,
  peMultiple,
  priceToBookMultiple,
  priceToSalesMultiple,
} from './multiples';
import type { CompanyValuationMetrics } from './types';

describe('computeEnterpriseValue', () => {
  it('Market Cap + Total Debt - Cash — matches a hand-calculated case', () => {
    expect(computeEnterpriseValue(1000, 200, 50)).toBe(1150);
  });

  it('is null when any input is missing — never assumes a missing debt/cash figure is zero', () => {
    expect(computeEnterpriseValue(null, 200, 50)).toBeNull();
    expect(computeEnterpriseValue(1000, null, 50)).toBeNull();
    expect(computeEnterpriseValue(1000, 200, null)).toBeNull();
  });

  it('a large net-cash position can legitimately produce a negative EV', () => {
    expect(computeEnterpriseValue(100, 0, 500)).toBe(-400);
  });
});

describe('computeMultiple', () => {
  it('is "ok" with a real value for a positive denominator', () => {
    expect(computeMultiple(1000, 200)).toEqual({ value: 5, status: 'ok' });
  });

  it('is "missingData" when either input is null', () => {
    expect(computeMultiple(null, 200)).toEqual({ value: null, status: 'missingData' });
    expect(computeMultiple(1000, null)).toEqual({ value: null, status: 'missingData' });
  });

  it('is "notMeaningful" for a negative denominator (e.g. negative EBITDA/earnings)', () => {
    expect(computeMultiple(1000, -50)).toEqual({ value: null, status: 'notMeaningful' });
  });

  it('is "notMeaningful" for a zero denominator', () => {
    expect(computeMultiple(1000, 0)).toEqual({ value: null, status: 'notMeaningful' });
  });

  it('a negative numerator is still meaningful (e.g. negative EV from a huge cash pile)', () => {
    expect(computeMultiple(-100, 50)).toEqual({ value: -2, status: 'ok' });
  });
});

describe('individual multiple wrappers route through computeMultiple identically', () => {
  it('EV/Revenue, EV/EBITDA, EV/EBIT, P/E, P/S, P/B all flag N/M on their own negative denominator', () => {
    expect(evToRevenueMultiple(1000, -10).status).toBe('notMeaningful');
    expect(evToEbitdaMultiple(1000, -10).status).toBe('notMeaningful');
    expect(evToEbitMultiple(1000, -10).status).toBe('notMeaningful');
    expect(peMultiple(1000, -10).status).toBe('notMeaningful');
    expect(priceToSalesMultiple(1000, -10).status).toBe('notMeaningful');
    expect(priceToBookMultiple(1000, -10).status).toBe('notMeaningful');
  });
});

function makeMetrics(overrides: Partial<CompanyValuationMetrics> = {}): CompanyValuationMetrics {
  return {
    ticker: 'TEST',
    name: 'Test Co',
    sector: 'Technology',
    industry: 'Software',
    exchange: 'NASDAQ',
    price: 20,
    marketCap: 1000,
    dilutedSharesOutstanding: 50,
    revenue: 500,
    revenueGrowth: 0.1,
    ebit: 100,
    ebitda: 140,
    netIncome: 80,
    cash: 50,
    totalDebt: 200,
    bookValue: 600,
    fiscalYear: 2023,
    filingType: '10-K',
    filingDate: '2024-02-01',
    financialsAsOf: null,
    stale: false,
    ...overrides,
  };
}

describe('computeCompanyMultiples — full hand-verified case', () => {
  // EV = 1000 + 200 - 50 = 1150
  // EV/Revenue = 1150/500 = 2.30
  // EV/EBITDA  = 1150/140 = 8.214285714...
  // EV/EBIT    = 1150/100 = 11.5
  // P/E        = 1000/80  = 12.5
  // P/S        = 1000/500 = 2.0
  // P/B        = 1000/600 = 1.6666...
  const multiples = computeCompanyMultiples(makeMetrics());

  it('computes enterprise value and equity value', () => {
    expect(multiples.enterpriseValue).toBe(1150);
    expect(multiples.equityValue).toBe(1000);
  });

  it('computes every multiple to the hand-verified value', () => {
    expect(multiples.evToRevenue).toEqual({ value: 2.3, status: 'ok' });
    expect(multiples.evToEbitda.value).toBeCloseTo(8.214285714, 6);
    expect(multiples.evToEbitda.status).toBe('ok');
    expect(multiples.evToEbit).toEqual({ value: 11.5, status: 'ok' });
    expect(multiples.peRatio).toEqual({ value: 12.5, status: 'ok' });
    expect(multiples.priceToSales).toEqual({ value: 2, status: 'ok' });
    expect(multiples.priceToBook.value).toBeCloseTo(1.666667, 5);
  });

  it('marks EV/EBITDA and P/E as N/M for a company with negative EBITDA and negative earnings', () => {
    const distressed = computeCompanyMultiples(makeMetrics({ ebitda: -30, netIncome: -10 }));
    expect(distressed.evToEbitda.status).toBe('notMeaningful');
    expect(distressed.evToEbitda.value).toBeNull();
    expect(distressed.peRatio.status).toBe('notMeaningful');
    expect(distressed.peRatio.value).toBeNull();
    // EV/Revenue is unaffected — a different denominator, still meaningful.
    expect(distressed.evToRevenue.status).toBe('ok');
  });

  it('marks every multiple as missingData when EBITDA itself is unavailable — never substitutes EBIT', () => {
    const noEbitda = computeCompanyMultiples(makeMetrics({ ebitda: null }));
    expect(noEbitda.evToEbitda).toEqual({ value: null, status: 'missingData' });
    // EV/EBIT is computed from a different, still-known field.
    expect(noEbitda.evToEbit.status).toBe('ok');
  });
});
