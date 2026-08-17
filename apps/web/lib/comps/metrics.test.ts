import { describe, expect, it } from 'vitest';
import type { CompanyOverview, FinancialPeriodData } from '@erp/types';
import { buildValuationMetrics, computeEbitda } from './metrics';

describe('computeEbitda', () => {
  it('is EBIT + D&A', () => {
    expect(computeEbitda(200, 50)).toBe(250);
  });

  it('is null when either input is missing — never falls back to EBIT alone', () => {
    expect(computeEbitda(200, null)).toBeNull();
    expect(computeEbitda(null, 50)).toBeNull();
  });

  it('handles a negative EBIT correctly (still a real EBITDA figure, possibly still negative)', () => {
    expect(computeEbitda(-100, 30)).toBe(-70);
  });
});

function makeOverview(overrides: Partial<CompanyOverview> = {}): CompanyOverview {
  return {
    ticker: 'TEST',
    name: 'Test Co',
    exchange: 'NASDAQ',
    sector: 'Technology',
    industry: 'Software',
    country: 'US',
    logoUrl: null,
    price: 100,
    changePercent: null,
    marketCap: 5000,
    yearHigh: null,
    yearLow: null,
    beta: 1.1,
    quoteUpdatedAt: null,
    stale: false,
    ...overrides,
  };
}

function makePeriod(overrides: Partial<FinancialPeriodData> = {}): FinancialPeriodData {
  return {
    fiscalYear: 2023,
    fiscalPeriod: 'FY',
    periodType: 'annual',
    periodStart: null,
    periodEnd: '2023-12-31',
    filingType: '10-K',
    filingDate: '2024-02-01',
    incomeStatement: {
      revenue: 1000,
      costOfRevenue: null,
      grossProfit: null,
      operatingExpenses: null,
      operatingIncome: 200,
      interestExpense: null,
      pretaxIncome: null,
      incomeTax: null,
      netIncome: 150,
      eps: null,
      dilutedEps: null,
      basicSharesOutstanding: null,
      dilutedSharesOutstanding: 50,
    },
    balanceSheet: {
      cashAndEquivalents: 300,
      shortTermInvestments: null,
      accountsReceivable: null,
      inventory: null,
      totalCurrentAssets: null,
      ppe: null,
      goodwill: null,
      intangibleAssets: null,
      totalAssets: null,
      accountsPayable: null,
      shortTermDebt: 50,
      longTermDebt: 450,
      totalCurrentLiabilities: null,
      totalLiabilities: null,
      stockholdersEquity: 800,
    },
    cashFlow: {
      operatingCashFlow: null,
      capex: null,
      investingCashFlow: null,
      financingCashFlow: null,
      freeCashFlow: null,
      depreciationAmortization: 40,
      stockBasedCompensation: null,
      changeInWorkingCapital: null,
    },
    ...overrides,
  };
}

describe('buildValuationMetrics', () => {
  it('passes through overview identity/quote fields unchanged', () => {
    const metrics = buildValuationMetrics(makeOverview(), makePeriod(), null);
    expect(metrics.ticker).toBe('TEST');
    expect(metrics.sector).toBe('Technology');
    expect(metrics.industry).toBe('Software');
    expect(metrics.price).toBe(100);
    expect(metrics.marketCap).toBe(5000);
  });

  it('pulls revenue/EBIT/net income/cash/book value from the latest period', () => {
    const metrics = buildValuationMetrics(makeOverview(), makePeriod(), null);
    expect(metrics.revenue).toBe(1000);
    expect(metrics.ebit).toBe(200);
    expect(metrics.netIncome).toBe(150);
    expect(metrics.cash).toBe(300);
    expect(metrics.bookValue).toBe(800);
  });

  it('derives EBITDA and total debt rather than reading them directly', () => {
    const metrics = buildValuationMetrics(makeOverview(), makePeriod(), null);
    expect(metrics.ebitda).toBe(240); // 200 + 40
    expect(metrics.totalDebt).toBe(500); // 50 + 450
  });

  it('computes revenue growth from the prior period, null with no prior period', () => {
    const noGrowth = buildValuationMetrics(makeOverview(), makePeriod(), null);
    expect(noGrowth.revenueGrowth).toBeNull();

    const withGrowth = buildValuationMetrics(
      makeOverview(),
      makePeriod({ incomeStatement: { ...makePeriod().incomeStatement, revenue: 1100 } }),
      makePeriod({ incomeStatement: { ...makePeriod().incomeStatement, revenue: 1000 } }),
    );
    expect(withGrowth.revenueGrowth).toBeCloseTo(0.1, 6);
  });

  it('every derived field is null when there is no financial period at all', () => {
    const metrics = buildValuationMetrics(makeOverview(), null, null);
    expect(metrics.revenue).toBeNull();
    expect(metrics.ebit).toBeNull();
    expect(metrics.ebitda).toBeNull();
    expect(metrics.netIncome).toBeNull();
    expect(metrics.cash).toBeNull();
    expect(metrics.totalDebt).toBeNull();
    expect(metrics.dilutedSharesOutstanding).toBeNull();
    // overview-sourced fields still pass through even with no financials
    expect(metrics.price).toBe(100);
  });

  it('carries the financialsAsOf timestamp through when provided', () => {
    const metrics = buildValuationMetrics(makeOverview(), makePeriod(), null, '2024-03-01T00:00:00.000Z');
    expect(metrics.financialsAsOf).toBe('2024-03-01T00:00:00.000Z');
  });
});
