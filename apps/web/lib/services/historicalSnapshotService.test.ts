import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FinancialPeriodData } from '@erp/types';
import { db } from '@/lib/db';

vi.mock('@/lib/services/financialDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/financialDataService')>();
  return { ...actual, getFinancials: vi.fn() };
});
vi.mock('@/lib/services/secFilingService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/secFilingService')>();
  return { ...actual, listFilings: vi.fn() };
});
vi.mock('@/lib/services/earningsCallService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/earningsCallService')>();
  return { ...actual, listEarningsCalls: vi.fn() };
});
vi.mock('@/lib/services/historicalPriceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/historicalPriceService')>();
  return { ...actual, getPriceAsOf: vi.fn() };
});
vi.mock('@/lib/backtest/pointInTimeValuation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backtest/pointInTimeValuation')>();
  return { ...actual, runPointInTimeDcf: vi.fn() };
});

import { getFinancials } from '@/lib/services/financialDataService';
import { listFilings } from '@/lib/services/secFilingService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { getPriceAsOf } from '@/lib/services/historicalPriceService';
import { runPointInTimeDcf } from '@/lib/backtest/pointInTimeValuation';
import { getSnapshotAsOf } from './historicalSnapshotService';

const TICKER = 'ZZSNAPSHOT1';

function makePeriod(fiscalYear: number, filingDate: string | null): FinancialPeriodData {
  return {
    fiscalYear,
    fiscalPeriod: 'FY',
    periodType: 'annual',
    periodStart: `${fiscalYear - 1}-01-01`,
    periodEnd: `${fiscalYear}-12-31`,
    filingType: '10-K',
    filingDate,
    incomeStatement: {
      revenue: 100, costOfRevenue: 40, grossProfit: 60, operatingExpenses: null, operatingIncome: 20,
      interestExpense: null, pretaxIncome: 19, incomeTax: 4, netIncome: 15, eps: null, dilutedEps: null,
      basicSharesOutstanding: null, dilutedSharesOutstanding: 10,
    },
    balanceSheet: {
      cashAndEquivalents: 20, shortTermInvestments: null, accountsReceivable: null, inventory: null,
      totalCurrentAssets: null, ppe: null, goodwill: null, intangibleAssets: null, totalAssets: null,
      accountsPayable: null, shortTermDebt: 5, longTermDebt: 10, totalCurrentLiabilities: null,
      totalLiabilities: null, stockholdersEquity: null,
    },
    cashFlow: {
      operatingCashFlow: null, capex: null, investingCashFlow: null, financingCashFlow: null,
      freeCashFlow: 15, depreciationAmortization: null, stockBasedCompensation: null, changeInWorkingCapital: null,
    },
  };
}

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

function resetMocks() {
  vi.mocked(getFinancials).mockReset().mockResolvedValue({ ticker: TICKER, periodType: 'annual', periods: [], stale: false, dataAsOf: null });
  vi.mocked(listFilings).mockReset().mockResolvedValue([]);
  vi.mocked(listEarningsCalls).mockReset().mockResolvedValue([]);
  vi.mocked(getPriceAsOf).mockReset().mockResolvedValue(null);
  vi.mocked(runPointInTimeDcf).mockReset().mockResolvedValue(null);
}

describe('getSnapshotAsOf', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.researchEvent.deleteMany({ where: { company: { ticker: TICKER } } });
  });

  it('returns null for an unknown ticker', async () => {
    resetMocks();
    expect(await getSnapshotAsOf('ZZNOTREAL999', '2026-01-01')).toBeNull();
  });

  it('excludes filings, earnings calls, and research events dated after asOfDate', async () => {
    resetMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Snapshot Co.' }, update: {} });

    vi.mocked(listFilings).mockResolvedValue([
      { id: 'f1', formType: '10-K', filingDate: new Date('2026-02-01') } as never,
      { id: 'f2', formType: '10-Q', filingDate: new Date('2026-08-01') } as never, // after asOfDate
    ]);
    vi.mocked(listEarningsCalls).mockResolvedValue([
      { id: 'c1', fiscalYear: 2026, fiscalQuarter: 1, callDate: new Date('2026-03-01'), periodEndDate: null } as never,
      { id: 'c2', fiscalYear: 2026, fiscalQuarter: 3, callDate: new Date('2026-09-01'), periodEndDate: null } as never, // after asOfDate
    ]);
    await db.researchEvent.create({
      data: {
        companyId: company.id, category: 'SEC_FILING', type: 'NEW_FILING', title: 'Before', description: 'x',
        materiality: 'HIGH', confidence: 'HIGH', dedupeKey: 'snap-before', eventDate: new Date('2026-02-15'),
      },
    });
    await db.researchEvent.create({
      data: {
        companyId: company.id, category: 'SEC_FILING', type: 'NEW_FILING', title: 'After', description: 'x',
        materiality: 'HIGH', confidence: 'HIGH', dedupeKey: 'snap-after', eventDate: new Date('2026-09-15'),
      },
    });

    const snapshot = await getSnapshotAsOf(TICKER, '2026-06-01');
    expect(snapshot?.filings.map((f) => f.id)).toEqual(['f1']);
    expect(snapshot?.earningsCalls.map((c) => c.id)).toEqual(['c1']);
    expect(snapshot?.researchEvents.map((e) => e.title)).toEqual(['Before']);
  });

  it('excludes an annual period not yet filed as of the date, and derives market cap from point-in-time price × point-in-time shares', async () => {
    resetMocks();
    await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Snapshot Co.' }, update: {} });

    vi.mocked(getFinancials).mockResolvedValue({
      ticker: TICKER,
      periodType: 'annual',
      periods: [makePeriod(2024, '2025-02-01'), makePeriod(2025, '2026-02-01')],
      stale: false,
      dataAsOf: null,
    });
    vi.mocked(getPriceAsOf).mockResolvedValue({ date: '2025-06-01', close: 50 });

    const snapshot = await getSnapshotAsOf(TICKER, '2025-06-01');
    expect(snapshot?.annualPeriodsKnown).toBe(1);
    expect(snapshot?.latestKnownFiscalYear).toBe(2024);
    expect(snapshot?.marketCap).toBe(50 * 10); // price × dilutedSharesOutstanding from the 2024 period
  });

  it('always includes the standard, fixed limitations disclosure', async () => {
    resetMocks();
    await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Snapshot Co.' }, update: {} });

    const snapshot = await getSnapshotAsOf(TICKER, '2026-01-01');
    expect(snapshot?.limitations.length).toBeGreaterThan(0);
    expect(snapshot?.limitations.some((l) => l.includes('Comparable-company data'))).toBe(true);
    expect(snapshot?.limitations.some((l) => l.includes('survivorship'))).toBe(true);
  });

  it('degrades gracefully to nulls/empties when everything is unavailable, never throwing', async () => {
    resetMocks();
    vi.mocked(getFinancials).mockRejectedValue(new Error('no SEC data'));
    await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Snapshot Co.' }, update: {} });

    const snapshot = await getSnapshotAsOf(TICKER, '2026-01-01');
    expect(snapshot).not.toBeNull();
    expect(snapshot?.annualPeriodsKnown).toBe(0);
    expect(snapshot?.price).toBeNull();
    expect(snapshot?.dcf).toBeNull();
  });
});
