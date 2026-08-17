import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { appleShapedFacts } from '@/lib/xbrl/__fixtures__/appleShaped';

/**
 * Integration test against the real local Postgres (same one `pnpm dev`
 * uses) — this is deliberately not mocked, because "duplicate prevention"
 * and "database insertion" are claims about the actual unique constraint in
 * prisma/schema.prisma, not about application logic that could pass against
 * a fake in-memory store while the real constraint is broken. Only the SEC
 * provider is mocked, with the same synthetic Apple-shaped fixture
 * normalize.test.ts uses.
 *
 * Uses a ticker ("ZZFIXTURETEST") that can't collide with a real company,
 * and cleans up everything it creates afterward.
 */

vi.mock('@/lib/providers/secEdgar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers/secEdgar')>();
  return {
    ...actual,
    resolveCik: vi.fn().mockResolvedValue({ cik: '0000000001', name: 'Fixture Fruit Co.' }),
    getCompanyFacts: vi.fn().mockResolvedValue(appleShapedFacts),
  };
});

const TEST_TICKER = 'ZZFIXTURETEST';

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TEST_TICKER } });
}

describe('financialDataService — real database integration', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('persists normalized periods with no duplicate rows for the same fiscal period', async () => {
    const { getFinancials } = await import('./financialDataService');
    const { getCompanyFacts } = await import('@/lib/providers/secEdgar');

    const first = await getFinancials(TEST_TICKER, 'annual');
    expect(first.periods.length).toBeGreaterThan(0);
    expect(first.stale).toBe(false);

    const company = await db.company.findUniqueOrThrow({ where: { ticker: TEST_TICKER } });
    const periodRows = await db.financialPeriod.findMany({ where: { companyId: company.id } });
    const fy2023Rows = periodRows.filter((p) => p.fiscalYear === 2023 && p.fiscalPeriod === 'FY');

    // The DB's own @@unique([companyId, fiscalYear, fiscalPeriod]) constraint
    // is what actually guarantees this — this assertion is checking that
    // guarantee held, not re-implementing it.
    expect(fy2023Rows).toHaveLength(1);

    // The restated value (111B, filed later) should be what's stored, not
    // the original 110B — see normalize.test.ts for the isolated version of
    // this assertion; here we're confirming it survives all the way to Postgres.
    const income = await db.incomeStatement.findUnique({ where: { periodId: fy2023Rows[0]?.id } });
    expect(income?.revenue).toBe(111_000_000_000);

    // Second call within the TTL window must serve from the DB, not refetch.
    const secondCallCountBefore = vi.mocked(getCompanyFacts).mock.calls.length;
    const second = await getFinancials(TEST_TICKER, 'annual');
    expect(vi.mocked(getCompanyFacts).mock.calls.length).toBe(secondCallCountBefore);
    expect(second.periods.length).toBe(first.periods.length);
  });

  it('does not create duplicate rows when refreshed again after the cache goes stale', async () => {
    const { getFinancials } = await import('./financialDataService');

    const company = await db.company.findUniqueOrThrow({ where: { ticker: TEST_TICKER } });
    // Force the TTL to have expired, then request again — this exercises
    // the exact upsert path a real scheduled refresh would take.
    await db.company.update({
      where: { id: company.id },
      data: { financialsSyncedAt: new Date(0) },
    });

    await getFinancials(TEST_TICKER, 'annual');

    const periodRows = await db.financialPeriod.findMany({ where: { companyId: company.id } });
    const fy2023Rows = periodRows.filter((p) => p.fiscalYear === 2023 && p.fiscalPeriod === 'FY');
    expect(fy2023Rows).toHaveLength(1);
  });

  it('regenerates raw_financial_facts without accumulating rows across refreshes', async () => {
    const { getFinancials } = await import('./financialDataService');
    const company = await db.company.findUniqueOrThrow({ where: { ticker: TEST_TICKER } });

    const beforeCount = await db.rawFinancialFact.count({ where: { companyId: company.id } });

    await db.company.update({
      where: { id: company.id },
      data: { financialsSyncedAt: new Date(0) },
    });
    await getFinancials(TEST_TICKER, 'annual');

    const afterCount = await db.rawFinancialFact.count({ where: { companyId: company.id } });
    expect(afterCount).toBe(beforeCount);
  });
});
