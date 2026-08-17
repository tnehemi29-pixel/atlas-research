import { describe, expect, it } from 'vitest';
import type { FinancialPeriodData, FiscalPeriod } from '@erp/types';
import {
  buildEarningsFinancialResults,
  findMatchingPeriod,
  findPriorQuarterPeriod,
  findPriorYearPeriod,
} from './financialResults';

function makePeriod(
  fiscalYear: number,
  fiscalPeriod: FiscalPeriod,
  overrides: {
    revenue: number;
    grossProfit: number;
    operatingIncome: number;
    netIncome: number;
    dilutedEps: number;
    freeCashFlow: number;
  },
): FinancialPeriodData {
  return {
    fiscalYear,
    fiscalPeriod,
    periodType: 'quarterly',
    periodStart: null,
    periodEnd: `${fiscalYear}-01-01`,
    filingType: '10-Q',
    filingDate: null,
    incomeStatement: {
      revenue: overrides.revenue,
      costOfRevenue: null,
      grossProfit: overrides.grossProfit,
      operatingExpenses: null,
      operatingIncome: overrides.operatingIncome,
      interestExpense: null,
      pretaxIncome: null,
      incomeTax: null,
      netIncome: overrides.netIncome,
      eps: overrides.dilutedEps,
      dilutedEps: overrides.dilutedEps,
      basicSharesOutstanding: null,
      dilutedSharesOutstanding: null,
    },
    balanceSheet: {
      cashAndEquivalents: null,
      shortTermInvestments: null,
      accountsReceivable: null,
      inventory: null,
      totalCurrentAssets: null,
      ppe: null,
      goodwill: null,
      intangibleAssets: null,
      totalAssets: null,
      accountsPayable: null,
      shortTermDebt: null,
      longTermDebt: null,
      totalCurrentLiabilities: null,
      totalLiabilities: null,
      stockholdersEquity: null,
    },
    cashFlow: {
      operatingCashFlow: null,
      capex: null,
      investingCashFlow: null,
      financingCashFlow: null,
      freeCashFlow: overrides.freeCashFlow,
      depreciationAmortization: null,
      stockBasedCompensation: null,
      changeInWorkingCapital: null,
    },
  };
}

const current = makePeriod(2025, 'Q3', {
  revenue: 110,
  grossProfit: 66,
  operatingIncome: 33,
  netIncome: 22,
  dilutedEps: 1.1,
  freeCashFlow: 20,
});
const priorQuarter = makePeriod(2025, 'Q2', {
  revenue: 100,
  grossProfit: 55,
  operatingIncome: 25,
  netIncome: 18,
  dilutedEps: 0.9,
  freeCashFlow: 15,
});
const priorYear = makePeriod(2024, 'Q3', {
  revenue: 90,
  grossProfit: 45,
  operatingIncome: 20,
  netIncome: 15,
  dilutedEps: 0.75,
  freeCashFlow: 12,
});

describe('findMatchingPeriod / findPriorQuarterPeriod / findPriorYearPeriod', () => {
  const periods = [current, priorQuarter, priorYear];

  it('finds the exact fiscal-year/quarter match', () => {
    expect(findMatchingPeriod(periods, 2025, 3)).toBe(current);
  });

  it('returns null when no period matches', () => {
    expect(findMatchingPeriod(periods, 2025, 4)).toBeNull();
  });

  it('finds the immediately preceding quarter within the same year', () => {
    expect(findPriorQuarterPeriod(periods, 2025, 3)).toBe(priorQuarter);
  });

  it('rolls over to Q4 of the prior year when the target is Q1', () => {
    const q4PriorYear = makePeriod(2024, 'Q4', {
      revenue: 105, grossProfit: 60, operatingIncome: 30, netIncome: 20, dilutedEps: 1.0, freeCashFlow: 18,
    });
    const result = findPriorQuarterPeriod([q4PriorYear], 2025, 1);
    expect(result).toBe(q4PriorYear);
  });

  it('finds the same quarter one year earlier', () => {
    expect(findPriorYearPeriod(periods, 2025, 3)).toBe(priorYear);
  });
});

describe('buildEarningsFinancialResults', () => {
  it('reports periodFound: false and all-null metrics when the current period is unavailable', () => {
    const result = buildEarningsFinancialResults(null, priorQuarter, priorYear);
    expect(result.periodFound).toBe(false);
    expect(result.metrics.every((m) => m.actual === null)).toBe(true);
  });

  it('computes revenue with correct QoQ/YoY growth', () => {
    const result = buildEarningsFinancialResults(current, priorQuarter, priorYear);
    const revenue = result.metrics.find((m) => m.label === 'Revenue')!;
    expect(revenue.actual).toBe(110);
    expect(revenue.changeKind).toBe('growth');
    expect(revenue.qoqChange).toBeCloseTo(0.1, 5); // 110/100 - 1
    expect(revenue.yoyChange).toBeCloseTo(0.2222, 3); // 110/90 - 1
  });

  it('computes diluted EPS with correct growth', () => {
    const result = buildEarningsFinancialResults(current, priorQuarter, priorYear);
    const eps = result.metrics.find((m) => m.label === 'Diluted EPS')!;
    expect(eps.actual).toBe(1.1);
    expect(eps.qoqChange).toBeCloseTo(0.2222, 3); // 1.1/0.9 - 1
    expect(eps.yoyChange).toBeCloseTo(0.4667, 3); // 1.1/0.75 - 1
  });

  it('computes gross margin as points, not a growth rate', () => {
    const result = buildEarningsFinancialResults(current, priorQuarter, priorYear);
    const gm = result.metrics.find((m) => m.label === 'Gross Margin')!;
    expect(gm.actual).toBeCloseTo(0.6, 5); // 66/110
    expect(gm.changeKind).toBe('points');
    expect(gm.qoqChange).toBeCloseTo(0.05, 5); // 0.6 - 0.55
    expect(gm.yoyChange).toBeCloseTo(0.1, 5); // 0.6 - 0.5
  });

  it('computes operating margin as points', () => {
    const result = buildEarningsFinancialResults(current, priorQuarter, priorYear);
    const om = result.metrics.find((m) => m.label === 'Operating Margin')!;
    expect(om.actual).toBeCloseTo(0.3, 5); // 33/110
    expect(om.qoqChange).toBeCloseTo(0.05, 5); // 0.3 - 0.25
    expect(om.yoyChange).toBeCloseTo(0.07778, 4); // 0.3 - 20/90
  });

  it('computes net income growth', () => {
    const result = buildEarningsFinancialResults(current, priorQuarter, priorYear);
    const ni = result.metrics.find((m) => m.label === 'Net Income')!;
    expect(ni.actual).toBe(22);
    expect(ni.qoqChange).toBeCloseTo(0.2222, 3); // 22/18 - 1
    expect(ni.yoyChange).toBeCloseTo(0.4667, 3); // 22/15 - 1
  });

  it('computes free cash flow growth', () => {
    const result = buildEarningsFinancialResults(current, priorQuarter, priorYear);
    const fcf = result.metrics.find((m) => m.label === 'Free Cash Flow')!;
    expect(fcf.actual).toBe(20);
    expect(fcf.qoqChange).toBeCloseTo(0.3333, 3); // 20/15 - 1
    expect(fcf.yoyChange).toBeCloseTo(0.6667, 3); // 20/12 - 1
  });

  it('leaves individual metrics null (not fabricated) when a comparison period is missing', () => {
    const result = buildEarningsFinancialResults(current, null, null);
    const revenue = result.metrics.find((m) => m.label === 'Revenue')!;
    expect(revenue.actual).toBe(110);
    expect(revenue.qoqChange).toBeNull();
    expect(revenue.yoyChange).toBeNull();
  });
});
