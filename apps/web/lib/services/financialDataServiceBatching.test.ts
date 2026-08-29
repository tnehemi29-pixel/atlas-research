import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, dbDirect } from '@/lib/db';
import { EMPTY_BALANCE_SHEET, EMPTY_CASH_FLOW, EMPTY_INCOME_STATEMENT } from '@/lib/xbrl/persist';
import type { NormalizedPeriod } from '@/lib/xbrl/types';
import { persistPeriods } from './financialDataService';

/**
 * Covers the AMD production bug: persistPeriods used to run every period's
 * upserts inside ONE interactive transaction, and a deep filer's full
 * history (AMD: 81 normalized periods = 324 sequential round trips) blew
 * past even a 20s transaction timeout with Prisma P2028 ("Transaction
 * already closed"). Periods are now persisted in bounded batches, each its
 * own transaction — this is a real-database integration test (same
 * rationale as financialDataService.test.ts: "batches actually commit
 * independently" and "a retry doesn't duplicate rows" are claims about
 * transaction/constraint behavior, not application logic a fake store could
 * pass while the real thing is broken). Kept in its own file because the
 * failure-injection test spies on dbDirect.$transaction, and doing that
 * inside financialDataService.test.ts risks bleeding into its own,
 * unrelated assertions.
 */

const TEST_TICKER = 'ZZBATCHTEST';

function makePeriod(fiscalYear: number, fiscalPeriod: NormalizedPeriod['fiscalPeriod'], revenue: number): NormalizedPeriod {
  const periodType = fiscalPeriod === 'FY' ? 'annual' : 'quarterly';
  return {
    fiscalYear,
    fiscalPeriod,
    periodType,
    periodStart: new Date(`${fiscalYear}-01-01`),
    periodEnd: new Date(`${fiscalYear}-12-31`),
    filingType: fiscalPeriod === 'FY' ? '10-K' : '10-Q',
    filingDate: `${fiscalYear + 1}-02-01`,
    accessionNumber: `0000000000-${fiscalYear}-${fiscalPeriod}`,
    incomeStatement: { ...EMPTY_INCOME_STATEMENT, revenue },
    balanceSheet: { ...EMPTY_BALANCE_SHEET },
    cashFlow: { ...EMPTY_CASH_FLOW },
    sources: {},
  };
}

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TEST_TICKER } });
}

describe('financialDataService persistPeriods batching — real database integration', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('splits a long history into multiple independent batch transactions and persists every period', async () => {
    const company = await db.company.create({ data: { ticker: TEST_TICKER, name: 'Batch Test Co.' } });
    // 23 periods: PERIOD_PERSIST_BATCH_SIZE (10) means 3 batches (10 + 10 + 3).
    const periods = Array.from({ length: 23 }, (_, i) => makePeriod(2000 + i, 'FY', 1_000_000 * (i + 1)));

    const transactionSpy = vi.spyOn(dbDirect, '$transaction');
    await persistPeriods(company.id, periods);

    expect(transactionSpy).toHaveBeenCalledTimes(3);
    transactionSpy.mockRestore();

    const rows = await db.financialPeriod.findMany({ where: { companyId: company.id }, include: { incomeStatement: true } });
    expect(rows).toHaveLength(23);
    const fy2010 = rows.find((r) => r.fiscalYear === 2010);
    expect(fy2010?.incomeStatement?.revenue).toBe(11_000_000);

    const refreshed = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(refreshed.financialsSyncedAt).not.toBeNull();
  }, 20000);

  it('persists a short history (fewer than one batch) in a single transaction, unchanged from before', async () => {
    await cleanup();
    const company = await db.company.create({ data: { ticker: TEST_TICKER, name: 'Batch Test Co.' } });
    const periods = [makePeriod(2024, 'FY', 5_000_000)];

    const transactionSpy = vi.spyOn(dbDirect, '$transaction');
    await persistPeriods(company.id, periods);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
    transactionSpy.mockRestore();

    const rows = await db.financialPeriod.findMany({ where: { companyId: company.id } });
    expect(rows).toHaveLength(1);
  }, 20000);

  it('propagates a batch failure, leaves earlier successful batches committed, and never marks the company as synced', async () => {
    await cleanup();
    const company = await db.company.create({ data: { ticker: TEST_TICKER, name: 'Batch Test Co.' } });
    // 15 periods -> batch 1 = periods[0..9] (fiscal years 2000-2009), batch 2 = periods[10..14] (2010-2014).
    const periods = Array.from({ length: 15 }, (_, i) => makePeriod(2000 + i, 'FY', 1_000_000 * (i + 1)));

    const realTransaction = dbDirect.$transaction.bind(dbDirect) as (...args: unknown[]) => Promise<unknown>;
    const transactionSpy = vi
      .spyOn(dbDirect, '$transaction')
      .mockImplementationOnce(((...args: unknown[]) => realTransaction(...args)) as typeof dbDirect.$transaction) // batch 1: real, succeeds
      .mockImplementationOnce(() => Promise.reject(new Error('simulated transaction failure (batch 2)')));

    await expect(persistPeriods(company.id, periods)).rejects.toThrow('simulated transaction failure (batch 2)');
    expect(transactionSpy).toHaveBeenCalledTimes(2);
    transactionSpy.mockRestore();

    const rowsAfterFailure = await db.financialPeriod.findMany({ where: { companyId: company.id } });
    expect(rowsAfterFailure).toHaveLength(10); // batch 1's 10 periods committed; batch 2's 5 never wrote
    expect(rowsAfterFailure.every((r) => r.fiscalYear <= 2009)).toBe(true);

    const afterFailure = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(afterFailure.financialsSyncedAt).toBeNull(); // never marked synced on a partial failure

    // Retry with the exact same full period list — must not duplicate batch 1's
    // already-committed rows, and must complete the rest.
    await persistPeriods(company.id, periods);

    const rowsAfterRetry = await db.financialPeriod.findMany({ where: { companyId: company.id } });
    expect(rowsAfterRetry).toHaveLength(15); // no duplicates from re-upserting batch 1
    const fy2000Rows = rowsAfterRetry.filter((r) => r.fiscalYear === 2000);
    expect(fy2000Rows).toHaveLength(1);

    const afterRetry = await db.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(afterRetry.financialsSyncedAt).not.toBeNull(); // now fully synced
  }, 30000);

  it('updates existing periods via upsert with no duplicate rows when the same period is persisted again', async () => {
    await cleanup();
    const company = await db.company.create({ data: { ticker: TEST_TICKER, name: 'Batch Test Co.' } });
    const original = [makePeriod(2024, 'FY', 5_000_000)];
    await persistPeriods(company.id, original);

    const updated = [makePeriod(2024, 'FY', 7_500_000)]; // restated revenue, same fiscal period
    await persistPeriods(company.id, updated);

    const rows = await db.financialPeriod.findMany({ where: { companyId: company.id }, include: { incomeStatement: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.incomeStatement?.revenue).toBe(7_500_000);
  }, 20000);
});
