import { describe, expect, it } from 'vitest';
import type { CompanyOverview, FinancialPeriodData } from '@erp/types';
import { buildMarketData } from './marketData';

function makeOverview(overrides: Partial<CompanyOverview> = {}): CompanyOverview {
  return {
    ticker: 'TEST',
    name: 'Test Co',
    exchange: 'NASDAQ',
    sector: null,
    industry: null,
    country: null,
    logoUrl: null,
    price: 100,
    changePercent: null,
    marketCap: 5000,
    yearHigh: null,
    yearLow: null,
    beta: 1.2,
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
    filingDate: null,
    incomeStatement: {
      revenue: 1000,
      costOfRevenue: null,
      grossProfit: null,
      operatingExpenses: null,
      operatingIncome: 200,
      interestExpense: 10,
      pretaxIncome: null,
      incomeTax: null,
      netIncome: null,
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
      stockholdersEquity: null,
    },
    cashFlow: {
      operatingCashFlow: null,
      capex: null,
      investingCashFlow: null,
      financingCashFlow: null,
      freeCashFlow: null,
      depreciationAmortization: null,
      stockBasedCompensation: null,
      changeInWorkingCapital: null,
    },
    ...overrides,
  };
}

describe('buildMarketData', () => {
  it('passes through price, market cap, and beta from the overview unchanged', () => {
    const result = buildMarketData(makeOverview(), [makePeriod()]);
    expect(result.currentSharePrice).toBe(100);
    expect(result.marketCapitalization).toBe(5000);
    expect(result.beta).toBe(1.2);
  });

  it('sums short-term and long-term debt from the latest annual period', () => {
    const result = buildMarketData(makeOverview(), [makePeriod()]);
    expect(result.totalDebt).toBe(500);
  });

  it('sums whichever debt breakout is present when only one is reported', () => {
    const result = buildMarketData(makeOverview(), [
      makePeriod({ balanceSheet: { ...makePeriod().balanceSheet, shortTermDebt: null, longTermDebt: 450 } }),
    ]);
    expect(result.totalDebt).toBe(450);
  });

  it('total debt is null, not zero, when neither breakout is reported', () => {
    const result = buildMarketData(makeOverview(), [
      makePeriod({ balanceSheet: { ...makePeriod().balanceSheet, shortTermDebt: null, longTermDebt: null } }),
    ]);
    expect(result.totalDebt).toBeNull();
  });

  it('picks the most recent fiscal year among multiple annual periods', () => {
    const older = makePeriod({ fiscalYear: 2021, incomeStatement: { ...makePeriod().incomeStatement, dilutedSharesOutstanding: 40 } });
    const newer = makePeriod({ fiscalYear: 2023, incomeStatement: { ...makePeriod().incomeStatement, dilutedSharesOutstanding: 50 } });
    const result = buildMarketData(makeOverview(), [older, newer]);
    expect(result.dilutedSharesOutstanding).toBe(50);
  });

  it('ignores quarterly periods when picking the latest period', () => {
    const quarterly = makePeriod({
      fiscalYear: 2024,
      periodType: 'quarterly',
      fiscalPeriod: 'Q1',
      incomeStatement: { ...makePeriod().incomeStatement, dilutedSharesOutstanding: 999 },
    });
    const annual = makePeriod({ fiscalYear: 2023 });
    const result = buildMarketData(makeOverview(), [quarterly, annual]);
    expect(result.dilutedSharesOutstanding).toBe(50);
  });

  it('every field is null when there is no financial data at all', () => {
    const result = buildMarketData(makeOverview({ price: null, marketCap: null, beta: null }), []);
    expect(result).toEqual({
      currentSharePrice: null,
      marketCapitalization: null,
      totalDebt: null,
      cash: null,
      dilutedSharesOutstanding: null,
      beta: null,
      interestExpense: null,
    });
  });
});
