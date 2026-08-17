import { describe, expect, it } from 'vitest';
import type { FinancialPeriodData } from '@erp/types';
import { computeChange, computeFcfMarginChangeBps, computeFinancialPeriodChanges, computeMarginChangeBps } from './changeDetection';

function makePeriod(overrides: Partial<{ revenue: number; grossProfit: number; operatingIncome: number; netIncome: number; dilutedEps: number; freeCashFlow: number; cash: number; shortTermDebt: number; longTermDebt: number; dilutedShares: number }> = {}): FinancialPeriodData {
  const revenue = overrides.revenue ?? 100;
  return {
    fiscalYear: 2026,
    fiscalPeriod: 'FY',
    periodType: 'annual',
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    filingType: '10-K',
    filingDate: '2026-02-01',
    incomeStatement: {
      revenue,
      costOfRevenue: revenue - (overrides.grossProfit ?? revenue * 0.6),
      grossProfit: overrides.grossProfit ?? revenue * 0.6,
      operatingExpenses: null,
      operatingIncome: overrides.operatingIncome ?? revenue * 0.25,
      interestExpense: null,
      pretaxIncome: null,
      incomeTax: null,
      netIncome: overrides.netIncome ?? revenue * 0.2,
      eps: null,
      dilutedEps: overrides.dilutedEps ?? 1,
      basicSharesOutstanding: null,
      dilutedSharesOutstanding: overrides.dilutedShares ?? 1_000_000_000,
    },
    balanceSheet: {
      cashAndEquivalents: overrides.cash ?? 30,
      shortTermInvestments: null,
      accountsReceivable: null,
      inventory: null,
      totalCurrentAssets: null,
      ppe: null,
      goodwill: null,
      intangibleAssets: null,
      totalAssets: null,
      accountsPayable: null,
      shortTermDebt: overrides.shortTermDebt ?? 5,
      longTermDebt: overrides.longTermDebt ?? 20,
      totalCurrentLiabilities: null,
      totalLiabilities: null,
      stockholdersEquity: null,
    },
    cashFlow: {
      operatingCashFlow: null,
      capex: null,
      investingCashFlow: null,
      financingCashFlow: null,
      freeCashFlow: overrides.freeCashFlow ?? revenue * 0.15,
      depreciationAmortization: null,
      stockBasedCompensation: null,
      changeInWorkingCapital: null,
    },
  };
}

describe('computeChange', () => {
  it('matches the spec worked example: revenue 100 -> 110 = +10%', () => {
    const result = computeChange(100, 110);
    expect(result.changePercent).toBeCloseTo(0.1);
    expect(result.changeAbsolute).toBe(10);
  });

  it('matches the spec worked example: DCF 150 -> 132 = -12%', () => {
    const result = computeChange(150, 132);
    expect(result.changePercent).toBeCloseTo(-0.12);
  });

  it('matches the spec worked example: guidance midpoint 10.5B -> 11.0B = +4.8%', () => {
    const result = computeChange(10.5, 11.0);
    expect(result.changePercent).toBeCloseTo(0.048, 2);
  });

  it('returns null (never a fabricated number) when either input is missing', () => {
    expect(computeChange(null, 110).changePercent).toBeNull();
    expect(computeChange(100, null).changePercent).toBeNull();
  });

  it('returns null rather than dividing by zero when the previous value is zero', () => {
    expect(computeChange(0, 10).changePercent).toBeNull();
  });
});

describe('computeMarginChangeBps', () => {
  it('matches the spec worked example: margin 25% -> 21% = -400 bps', () => {
    const result = computeMarginChangeBps(0.25, 0.21);
    expect(result.changeBps).toBeCloseTo(-400);
  });

  it('returns null when either margin is unavailable', () => {
    expect(computeMarginChangeBps(null, 0.21).changeBps).toBeNull();
  });
});

describe('computeFinancialPeriodChanges', () => {
  it('computes every metric the milestone spec lists', () => {
    const previous = makePeriod({ revenue: 100, operatingIncome: 22, dilutedEps: 1, freeCashFlow: 15, cash: 30, shortTermDebt: 5, longTermDebt: 20, dilutedShares: 1_000_000_000 });
    const current = makePeriod({ revenue: 110, operatingIncome: 25.3, dilutedEps: 1.1, freeCashFlow: 18, cash: 35, shortTermDebt: 5, longTermDebt: 18, dilutedShares: 990_000_000 });

    const changes = computeFinancialPeriodChanges(previous, current);

    expect(changes.revenue.changePercent).toBeCloseTo(0.1);
    expect(changes.dilutedEps.changePercent).toBeCloseTo(0.1);
    expect(changes.operatingMargin.changeBps).toBeCloseTo(100, 0); // 22% -> 23.0% = +100bps
    expect(changes.freeCashFlow.changeAbsolute).toBeCloseTo(3);
    expect(changes.totalDebt.previous).toBe(25);
    expect(changes.totalDebt.current).toBe(23);
    expect(changes.cash.changeAbsolute).toBeCloseTo(5);
    expect(changes.dilutedSharesOutstanding.changePercent).toBeLessThan(0); // buyback -> fewer shares
  });

  it('returns null changes (not zero) when there is no prior period', () => {
    const current = makePeriod();
    const changes = computeFinancialPeriodChanges(null, current);

    expect(changes.revenue.changePercent).toBeNull();
    expect(changes.operatingMargin.changeBps).toBeNull();
    expect(changes.revenue.current).toBe(100); // current is still reported, just no comparison
  });

  it('handles a company with no debt on the balance sheet without throwing', () => {
    const previous = makePeriod();
    previous.balanceSheet.shortTermDebt = null;
    previous.balanceSheet.longTermDebt = null;
    const current = makePeriod();
    current.balanceSheet.shortTermDebt = null;
    current.balanceSheet.longTermDebt = null;

    const changes = computeFinancialPeriodChanges(previous, current);
    expect(changes.totalDebt.previous).toBeNull();
    expect(changes.totalDebt.current).toBeNull();
  });
});

describe('computeFcfMarginChangeBps', () => {
  it('computes FCF margin change independently', () => {
    const previous = makePeriod({ revenue: 100, freeCashFlow: 15 });
    const current = makePeriod({ revenue: 100, freeCashFlow: 20 });
    const result = computeFcfMarginChangeBps(previous, current);
    expect(result.changeBps).toBeCloseTo(500);
  });
});
