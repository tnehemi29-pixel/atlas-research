import { describe, expect, it } from 'vitest';
import type { FinancialPeriodData, FiscalPeriod, PeriodType } from '@erp/types';
import {
  findAdjacentPriorPeriod,
  findAdjacentPriorPeriodByRef,
  findPriorYearPeriod,
  sliceByRange,
} from './periodMetrics';
import { EMPTY_BALANCE_SHEET, EMPTY_CASH_FLOW, EMPTY_INCOME_STATEMENT } from '@/lib/xbrl/persist';

function period(
  fiscalYear: number,
  fiscalPeriod: FiscalPeriod,
  periodType: PeriodType,
  revenue: number | null = null,
): FinancialPeriodData {
  return {
    fiscalYear,
    fiscalPeriod,
    periodType,
    periodStart: null,
    periodEnd: `${fiscalYear}-12-31`,
    filingType: '10-K',
    filingDate: `${fiscalYear}-12-31`,
    incomeStatement: { ...EMPTY_INCOME_STATEMENT, revenue },
    balanceSheet: EMPTY_BALANCE_SHEET,
    cashFlow: EMPTY_CASH_FLOW,
  };
}

describe('findPriorYearPeriod — annual', () => {
  const periods = [period(2023, 'FY', 'annual', 300), period(2022, 'FY', 'annual', 250)];

  it('finds the previous fiscal year for a YoY comparison', () => {
    const prior = findPriorYearPeriod(periods, periods[0]!);
    expect(prior?.fiscalYear).toBe(2022);
  });

  it('returns undefined for the earliest period (no prior year exists)', () => {
    const prior = findPriorYearPeriod(periods, periods[1]!);
    expect(prior).toBeUndefined();
  });
});

describe('findPriorYearPeriod — quarterly', () => {
  const periods = [
    period(2024, 'Q2', 'quarterly', 40),
    period(2024, 'Q1', 'quarterly', 38),
    period(2023, 'Q2', 'quarterly', 35),
    period(2023, 'Q1', 'quarterly', 33),
  ];

  it('matches the same quarter one year earlier, not the immediately preceding quarter', () => {
    const prior = findPriorYearPeriod(periods, periods[0]!); // Q2 2024
    expect(prior?.fiscalYear).toBe(2023);
    expect(prior?.fiscalPeriod).toBe('Q2');
    expect(prior?.incomeStatement.revenue).toBe(35);
  });

  it('handles a gap in the data — a missing same-quarter-last-year period resolves to undefined, not the nearest available quarter', () => {
    // Real, verified behavior: JPMorgan doesn't tag a quarterly Revenues fact
    // for every quarter. If 2023 Q2 is simply absent from the data...
    const withGap = [period(2024, 'Q2', 'quarterly', 40), period(2024, 'Q1', 'quarterly', 38)];
    const prior = findPriorYearPeriod(withGap, withGap[0]!);
    expect(prior).toBeUndefined();
  });
});

describe('findAdjacentPriorPeriod', () => {
  it('returns the next entry in a newest-first list', () => {
    const periods = [period(2023, 'FY', 'annual'), period(2022, 'FY', 'annual')];
    expect(findAdjacentPriorPeriod(periods, 0)?.fiscalYear).toBe(2022);
  });

  it('returns undefined past the end of the list', () => {
    const periods = [period(2023, 'FY', 'annual')];
    expect(findAdjacentPriorPeriod(periods, 0)).toBeUndefined();
  });
});

describe('findAdjacentPriorPeriodByRef', () => {
  it('finds the prior period by object identity rather than a pre-known index', () => {
    const periods = [period(2023, 'FY', 'annual'), period(2022, 'FY', 'annual')];
    expect(findAdjacentPriorPeriodByRef(periods, periods[0]!)?.fiscalYear).toBe(2022);
  });

  it('returns undefined for the last period, and for a period not in the list at all', () => {
    const periods = [period(2023, 'FY', 'annual'), period(2022, 'FY', 'annual')];
    expect(findAdjacentPriorPeriodByRef(periods, periods[1]!)).toBeUndefined();
    expect(findAdjacentPriorPeriodByRef(periods, period(2099, 'FY', 'annual'))).toBeUndefined();
  });
});

describe('sliceByRange', () => {
  const annualPeriods = Array.from({ length: 10 }, (_, i) => period(2023 - i, 'FY', 'annual'));
  const quarterlyPeriods = Array.from({ length: 40 }, (_, i) =>
    period(2024, (['Q1', 'Q2', 'Q3', 'Q4'] as const)[i % 4]!, 'quarterly'),
  );

  it('slices annual data to N years', () => {
    expect(sliceByRange(annualPeriods, 3, 'annual')).toHaveLength(3);
    expect(sliceByRange(annualPeriods, 5, 'annual')).toHaveLength(5);
  });

  it('slices quarterly data to N years worth of quarters', () => {
    expect(sliceByRange(quarterlyPeriods, 3, 'quarterly')).toHaveLength(12);
  });

  it('"max" returns everything available, capped by whatever the API already returned', () => {
    expect(sliceByRange(annualPeriods, 'max', 'annual')).toHaveLength(10);
  });

  it('never throws or over-slices when fewer periods exist than the requested range', () => {
    const short = annualPeriods.slice(0, 2);
    expect(sliceByRange(short, 10, 'annual')).toHaveLength(2);
  });
});
