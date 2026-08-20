import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FinancialPeriodData } from '@erp/types';

vi.mock('@/lib/services/financialDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/financialDataService')>();
  return { ...actual, getFinancials: vi.fn() };
});
vi.mock('@/lib/services/companyService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/companyService')>();
  return { ...actual, getCompanyOverview: vi.fn() };
});
vi.mock('@/lib/services/historicalPriceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/historicalPriceService')>();
  return { ...actual, getPriceAsOf: vi.fn() };
});

import { getFinancials, CompanyNotFoundError } from '@/lib/services/financialDataService';
import { getCompanyOverview } from '@/lib/services/companyService';
import { getPriceAsOf } from '@/lib/services/historicalPriceService';
import { filterPeriodsAsOf, runPointInTimeDcf } from './pointInTimeValuation';

function makePeriod(fiscalYear: number, filingDate: string | null, revenue = 100_000_000_000): FinancialPeriodData {
  return {
    fiscalYear,
    fiscalPeriod: 'FY',
    periodType: 'annual',
    periodStart: `${fiscalYear - 1}-01-01`,
    periodEnd: `${fiscalYear}-12-31`,
    filingType: '10-K',
    filingDate,
    incomeStatement: {
      revenue,
      costOfRevenue: revenue * 0.4,
      grossProfit: revenue * 0.6,
      operatingExpenses: null,
      operatingIncome: revenue * 0.2,
      interestExpense: revenue * 0.01,
      pretaxIncome: revenue * 0.19,
      incomeTax: revenue * 0.04,
      netIncome: revenue * 0.15,
      eps: null,
      dilutedEps: null,
      basicSharesOutstanding: null,
      dilutedSharesOutstanding: 1_000_000_000,
    },
    balanceSheet: {
      cashAndEquivalents: revenue * 0.2,
      shortTermInvestments: null,
      accountsReceivable: null,
      inventory: null,
      totalCurrentAssets: null,
      ppe: null,
      goodwill: null,
      intangibleAssets: null,
      totalAssets: null,
      accountsPayable: null,
      shortTermDebt: revenue * 0.02,
      longTermDebt: revenue * 0.1,
      totalCurrentLiabilities: null,
      totalLiabilities: null,
      stockholdersEquity: null,
    },
    cashFlow: {
      operatingCashFlow: null,
      capex: revenue * -0.04,
      investingCashFlow: null,
      financingCashFlow: null,
      freeCashFlow: revenue * 0.15,
      depreciationAmortization: revenue * 0.03,
      stockBasedCompensation: null,
      changeInWorkingCapital: null,
    },
  };
}

describe('filterPeriodsAsOf', () => {
  it('excludes a period filed after the as-of date', () => {
    const periods = [makePeriod(2024, '2025-02-01'), makePeriod(2025, '2026-02-01')];
    expect(filterPeriodsAsOf(periods, '2025-06-01').map((p) => p.fiscalYear)).toEqual([2024]);
  });

  it('excludes a period with an unknown (null) filing date, conservatively', () => {
    const periods = [makePeriod(2024, null)];
    expect(filterPeriodsAsOf(periods, '2026-01-01')).toEqual([]);
  });

  it('includes a period filed exactly on the as-of date', () => {
    const periods = [makePeriod(2024, '2025-02-01')];
    expect(filterPeriodsAsOf(periods, '2025-02-01')).toHaveLength(1);
  });
});

describe('runPointInTimeDcf', () => {
  afterEach(() => {
    vi.mocked(getFinancials).mockReset();
    vi.mocked(getCompanyOverview).mockReset();
    vi.mocked(getPriceAsOf).mockReset();
  });

  it('never uses a period filed after asOfDate, and never uses the current price', async () => {
    vi.mocked(getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: [makePeriod(2020, '2021-02-01', 80_000_000_000), makePeriod(2021, '2022-02-01', 90_000_000_000), makePeriod(2025, '2026-02-01', 500_000_000_000)],
      stale: false,
      dataAsOf: '2026-01-01',
    });
    vi.mocked(getPriceAsOf).mockResolvedValue({ date: '2022-06-01', close: 50 });
    vi.mocked(getCompanyOverview).mockResolvedValue({
      ticker: 'ACME', name: 'Acme', exchange: null, sector: null, industry: null, country: null, logoUrl: null,
      price: 999, changePercent: null, marketCap: 999_000_000_000, yearHigh: null, yearLow: null, beta: 1.2, quoteUpdatedAt: null, stale: false,
    });

    const result = await runPointInTimeDcf('ACME', '2022-06-01');
    expect(result).not.toBeNull();
    expect(result?.annualPeriodsKnown).toBe(2); // the 2025 period (filed 2026) must be excluded
    expect(result?.currentSharePrice).toBe(50); // the point-in-time price, never the "current" 999
  });

  it('returns null when no annual period had been filed yet as of the date', async () => {
    vi.mocked(getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: [makePeriod(2025, '2026-02-01')],
      stale: false,
      dataAsOf: '2026-01-01',
    });

    expect(await runPointInTimeDcf('ACME', '2020-01-01')).toBeNull();
    expect(getPriceAsOf).not.toHaveBeenCalled();
  });

  it('returns null when no historical price is available for the date, even with known periods', async () => {
    vi.mocked(getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: [makePeriod(2020, '2021-02-01'), makePeriod(2021, '2022-02-01')],
      stale: false,
      dataAsOf: '2026-01-01',
    });
    vi.mocked(getPriceAsOf).mockResolvedValue(null);

    expect(await runPointInTimeDcf('ACME', '2022-06-01')).toBeNull();
  });

  it('returns null when the company cannot be resolved', async () => {
    vi.mocked(getFinancials).mockRejectedValue(new CompanyNotFoundError('no filer'));
    expect(await runPointInTimeDcf('NOPE', '2022-06-01')).toBeNull();
  });

  // Company.costOfDebtOverride (an explicitly saved manual WACC assumption,
  // see prisma/schema.prisma) is never consulted here — runPointInTimeDcf's
  // signature is just (ticker, asOfDate), and buildPointInTimeMarketData only
  // reads the point-in-time period's own interestExpense, never a Company
  // row. This test proves the point-in-time WACC calculation stays exactly
  // as blocked as it would be for any company with no saved override, when
  // the historical period itself has no interest expense to calculate from
  // — a company-level override existing in the database (regardless of its
  // value) could never change this result.
  it('does not use a company-level cost-of-debt override — stays blocked on missing period-level interest expense alone', async () => {
    const periodWithoutInterestExpense: FinancialPeriodData = {
      ...makePeriod(2021, '2022-02-01'),
      incomeStatement: { ...makePeriod(2021, '2022-02-01').incomeStatement, interestExpense: null },
    };
    vi.mocked(getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: [periodWithoutInterestExpense],
      stale: false,
      dataAsOf: '2026-01-01',
    });
    vi.mocked(getPriceAsOf).mockResolvedValue({ date: '2022-06-01', close: 50 });
    vi.mocked(getCompanyOverview).mockResolvedValue({
      ticker: 'ACME', name: 'Acme', exchange: null, sector: null, industry: null, country: null, logoUrl: null,
      price: 999, changePercent: null, marketCap: 999_000_000_000, yearHigh: null, yearLow: null, beta: 1.2, quoteUpdatedAt: null, stale: false,
    });

    const result = await runPointInTimeDcf('ACME', '2022-06-01');
    expect(result).not.toBeNull();
    expect(result?.isValid).toBe(false);
    expect(result?.forecast).toEqual([]);
  });
});
