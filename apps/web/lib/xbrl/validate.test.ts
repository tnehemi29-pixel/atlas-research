import { describe, expect, it } from 'vitest';
import { applyValidation, validatePeriod } from './validate';
import type { NormalizedPeriod } from './types';

function makePeriod(overrides: Partial<NormalizedPeriod> = {}): NormalizedPeriod {
  return {
    fiscalYear: 2023,
    fiscalPeriod: 'FY',
    periodType: 'annual',
    periodStart: new Date('2022-09-25'),
    periodEnd: new Date('2023-09-30'),
    filingType: '10-K',
    filingDate: '2023-11-03',
    accessionNumber: 'FIX-1',
    incomeStatement: {
      revenue: 100,
      costOfRevenue: null,
      grossProfit: null,
      operatingExpenses: null,
      operatingIncome: null,
      interestExpense: null,
      pretaxIncome: null,
      incomeTax: null,
      netIncome: 20,
      eps: 1.5,
      dilutedEps: 1.4,
      basicSharesOutstanding: 1_000_000,
      dilutedSharesOutstanding: 1_010_000,
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
      totalAssets: 500,
      accountsPayable: null,
      shortTermDebt: null,
      longTermDebt: null,
      totalCurrentLiabilities: null,
      totalLiabilities: 300,
      stockholdersEquity: 200,
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
    sources: {},
    ...overrides,
  };
}

describe('validatePeriod — balance equation', () => {
  it('passes when assets = liabilities + equity', () => {
    const issues = validatePeriod(makePeriod());
    expect(issues.filter((i) => i.field === 'totalAssets')).toHaveLength(0);
  });

  it('flags a WARNING when assets do not approximately equal liabilities + equity', () => {
    const period = makePeriod({
      balanceSheet: {
        ...makePeriod().balanceSheet,
        totalAssets: 500,
        totalLiabilities: 300,
        stockholdersEquity: 100, // should be 200 to balance
      },
    });
    const issues = validatePeriod(period);
    const balanceIssue = issues.find((i) => i.field === 'totalAssets');
    expect(balanceIssue?.severity).toBe('WARNING');
  });
});

describe('validatePeriod — EPS and shares sanity', () => {
  it('flags an ERROR when EPS is implausibly large (looks like a dollar figure, not per-share)', () => {
    const period = makePeriod({
      incomeStatement: { ...makePeriod().incomeStatement, dilutedEps: 96_995_000_000 },
    });
    const issues = validatePeriod(period);
    const epsIssue = issues.find((i) => i.field === 'dilutedEps');
    expect(epsIssue?.severity).toBe('ERROR');
  });

  it('flags an ERROR when dilutedSharesOutstanding is implausibly small (looks like a per-share figure)', () => {
    const period = makePeriod({
      incomeStatement: { ...makePeriod().incomeStatement, dilutedSharesOutstanding: 6.11 },
    });
    const issues = validatePeriod(period);
    const sharesIssue = issues.find((i) => i.field === 'dilutedSharesOutstanding');
    expect(sharesIssue?.severity).toBe('ERROR');
  });

  it('does not flag a normal EPS or share count', () => {
    const issues = validatePeriod(makePeriod());
    expect(
      issues.filter((i) => i.field === 'dilutedEps' || i.field === 'dilutedSharesOutstanding'),
    ).toHaveLength(0);
  });
});

describe('validatePeriod — magnitude jump vs. prior period', () => {
  it('flags a WARNING when revenue changes more than 50x vs. the prior same-type period', () => {
    const previous = makePeriod({
      fiscalYear: 2022,
      incomeStatement: { ...makePeriod().incomeStatement, revenue: 100 },
    });
    const current = makePeriod({
      fiscalYear: 2023,
      incomeStatement: { ...makePeriod().incomeStatement, revenue: 10_000 },
    });
    const issues = validatePeriod(current, previous);
    expect(issues.some((i) => i.field === 'revenue' && i.severity === 'WARNING')).toBe(true);
  });

  it('does not flag ordinary year-over-year growth', () => {
    const previous = makePeriod({
      fiscalYear: 2022,
      incomeStatement: { ...makePeriod().incomeStatement, revenue: 100 },
    });
    const current = makePeriod({
      fiscalYear: 2023,
      incomeStatement: { ...makePeriod().incomeStatement, revenue: 115 },
    });
    const issues = validatePeriod(current, previous);
    expect(issues.some((i) => i.field === 'revenue')).toBe(false);
  });

  it('never flags a negative value on its own — negative figures are financially meaningful', () => {
    const period = makePeriod({
      incomeStatement: { ...makePeriod().incomeStatement, netIncome: -50 },
    });
    const issues = validatePeriod(period);
    expect(issues.some((i) => i.field === 'netIncome')).toBe(false);
  });
});

describe('applyValidation', () => {
  it('nulls out only the field an ERROR was raised against, leaving the rest of the period intact', () => {
    const period = makePeriod({
      incomeStatement: { ...makePeriod().incomeStatement, dilutedEps: 96_995_000_000 },
    });
    const issues = validatePeriod(period);
    const cleaned = applyValidation(period, issues);

    expect(cleaned.incomeStatement.dilutedEps).toBeNull();
    // Unrelated fields are untouched.
    expect(cleaned.incomeStatement.revenue).toBe(100);
    expect(cleaned.incomeStatement.netIncome).toBe(20);
  });

  it('leaves WARNING-only periods completely unchanged', () => {
    const period = makePeriod({
      balanceSheet: { ...makePeriod().balanceSheet, stockholdersEquity: 100 }, // balance-equation WARNING
    });
    const issues = validatePeriod(period);
    const cleaned = applyValidation(period, issues);
    expect(cleaned.balanceSheet.stockholdersEquity).toBe(100);
  });
});
