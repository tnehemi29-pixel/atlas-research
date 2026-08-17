import { describe, expect, it } from 'vitest';
import type { FinancialPeriodData } from '@erp/types';
import { filterPeriodsAsOf } from '@/lib/backtest/pointInTimeValuation';
import { auditHistoricalValidationDisclosure } from './historicalValidationAudit';

describe('auditHistoricalValidationDisclosure', () => {
  it('discloses zero observations honestly rather than a fabricated result', () => {
    const findings = auditHistoricalValidationDisclosure({ sampleSize: 0, methodology: ['x'] });
    const sampleFinding = findings.find((f) => f.check.includes('sample size'));
    expect(sampleFinding?.message).toMatch(/no historical observations/i);
  });

  it('flags a low-confidence note below the minimum sample size, without treating it as a failure', () => {
    const findings = auditHistoricalValidationDisclosure({ sampleSize: 3, methodology: ['x'] });
    const sampleFinding = findings.find((f) => f.check.includes('sample size'));
    expect(sampleFinding?.severity).toBe('LOW');
    expect(sampleFinding?.passed).toBe(true);
    expect(sampleFinding?.message).toMatch(/directional, not statistically conclusive/);
  });

  it('passes cleanly with an adequate sample size', () => {
    const findings = auditHistoricalValidationDisclosure({ sampleSize: 78, methodology: ['x'], benchmarkTicker: 'SPY' });
    expect(findings.every((f) => f.passed)).toBe(true);
  });

  it('flags MEDIUM severity when no methodology/limitations text is attached', () => {
    const findings = auditHistoricalValidationDisclosure({ sampleSize: 20, methodology: [] });
    const methodologyFinding = findings.find((f) => f.check.includes('methodology'));
    expect(methodologyFinding?.passed).toBe(false);
    expect(methodologyFinding?.severity).toBe('MEDIUM');
  });

  it('flags missing benchmark disclosure when benchmarkTicker is explicitly checked', () => {
    const findings = auditHistoricalValidationDisclosure({ sampleSize: 20, methodology: ['x'], benchmarkTicker: null });
    const benchmarkFinding = findings.find((f) => f.check.includes('benchmark'));
    expect(benchmarkFinding?.passed).toBe(false);
  });

  it('honestly flags a capped result rather than silently truncating it', () => {
    const findings = auditHistoricalValidationDisclosure({ sampleSize: 120, methodology: ['x'], wasCapped: true });
    const cappedFinding = findings.find((f) => f.check.includes('cap'));
    expect(cappedFinding).toBeDefined();
    expect(cappedFinding?.passed).toBe(true);
  });
});

/**
 * Spec section 17 / section 28's "Historical validation: Future filing
 * exists -> Expected: Historical snapshot cannot access it" — a regression
 * test proving Milestone 12's own no-look-ahead guarantee (filterPeriodsAsOf)
 * still holds, reused directly rather than re-implemented at this layer.
 */
describe('historical validation integrity — no-look-ahead regression (reusing Milestone 12 directly)', () => {
  function makePeriod(fiscalYear: number, filingDate: string | null): FinancialPeriodData {
    const revenue = 100_000_000_000;
    return {
      fiscalYear,
      fiscalPeriod: 'FY',
      periodType: 'annual',
      periodStart: `${fiscalYear - 1}-01-01`,
      periodEnd: `${fiscalYear}-12-31`,
      filingType: '10-K',
      filingDate,
      incomeStatement: {
        revenue, costOfRevenue: revenue * 0.4, grossProfit: revenue * 0.6, operatingExpenses: null, operatingIncome: revenue * 0.2,
        interestExpense: revenue * 0.01, pretaxIncome: revenue * 0.19, incomeTax: revenue * 0.04, netIncome: revenue * 0.15,
        eps: null, dilutedEps: null, basicSharesOutstanding: null, dilutedSharesOutstanding: 1_000_000_000,
      },
      balanceSheet: {
        cashAndEquivalents: revenue * 0.2, shortTermInvestments: null, accountsReceivable: null, inventory: null, totalCurrentAssets: null,
        ppe: null, goodwill: null, intangibleAssets: null, totalAssets: null, accountsPayable: null,
        shortTermDebt: revenue * 0.02, longTermDebt: revenue * 0.1, totalCurrentLiabilities: null, totalLiabilities: null, stockholdersEquity: null,
      },
      cashFlow: {
        operatingCashFlow: null, capex: revenue * -0.04, investingCashFlow: null, financingCashFlow: null, freeCashFlow: revenue * 0.15,
        depreciationAmortization: revenue * 0.03, stockBasedCompensation: null, changeInWorkingCapital: null,
      },
    };
  }

  it('a fiscal-year filing dated in the future relative to the as-of date is excluded from the point-in-time snapshot', () => {
    const periods = [makePeriod(2024, '2025-02-01'), makePeriod(2025, '2027-02-01')]; // 2025's filing is "in the future" relative to the as-of date below
    const visible = filterPeriodsAsOf(periods, '2026-01-01');
    expect(visible.map((p) => p.fiscalYear)).toEqual([2024]);
    expect(visible.some((p) => p.fiscalYear === 2025)).toBe(false);
  });
});
