import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';

/**
 * Integration test against the real local Postgres — the same rationale as
 * financialDataService.test.ts: duplicate prevention is a claim about the
 * actual @@unique constraint in prisma/schema.prisma, not something a mock
 * can verify. SEC and the LLM are the only things mocked. Uses a ticker
 * that can't collide with a real company, and cleans up everything it
 * creates afterward.
 */

const SUBMISSIONS_FIXTURE = {
  cik: '1',
  name: 'Fixture Filing Co.',
  filings: [
    {
      accessionNumber: '0000000001-24-000001',
      form: '10-K',
      filingDate: '2024-11-01',
      reportDate: '2024-09-28',
      items: null,
      primaryDocument: 'fixture-10k.htm',
      primaryDocDescription: '10-K',
      size: 500000,
      isXBRL: true,
    },
    {
      accessionNumber: '0000000001-24-000002',
      form: '8-K',
      filingDate: '2024-08-01',
      reportDate: null,
      items: '2.02,9.01',
      primaryDocument: 'fixture-8k.htm',
      primaryDocDescription: '8-K',
      size: 12000,
      isXBRL: false,
    },
  ],
};

const TEN_K_HTML = `
<html><body>
  <div style="font-weight:bold">Item 1. Business</div>
  <p>Fixture Filing Co. designs and sells fixtures for automated testing.</p>
  <div style="font-weight:bold">Item 1A. Risk Factors</div>
  <p>Our tests may fail if our fixtures are not realistic enough.</p>
</body></html>
`;

vi.mock('@/lib/providers/secEdgar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers/secEdgar')>();
  return {
    ...actual,
    resolveCik: vi.fn().mockResolvedValue({ cik: '0000000001', name: 'Fixture Filing Co.' }),
    getSubmissions: vi.fn().mockResolvedValue(SUBMISSIONS_FIXTURE),
    getFilingDocument: vi.fn().mockResolvedValue(TEN_K_HTML),
  };
});

vi.mock('@/lib/ai/anthropicClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/anthropicClient')>();
  return {
    ...actual,
    requestStructuredCompletion: vi.fn().mockResolvedValue({
      data: {
        summary: 'Fixture Filing Co. reported steady results in this filing.',
        key_changes: [],
        risks: [
          {
            description: 'Test fixtures may not represent real-world conditions.',
            category: 'operational',
            source: { section: 'RISK_FACTORS', excerpt: 'Our tests may fail if our fixtures are not realistic enough.' },
          },
        ],
        management_commentary: [],
        capital_allocation: [],
        accounting_changes: [],
      },
      model: 'claude-sonnet-4-5-fixture',
      inputTokens: 321,
      outputTokens: 145,
    }),
  };
});

const TEST_TICKER = 'ZZFILINGTEST';

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TEST_TICKER } });
}

describe('secFilingService — real database integration', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  // A higher-than-default timeout: this file's first Postgres query pays a
  // one-time connection-warmup cost (a couple of seconds is normal for a
  // fresh Prisma connection), not a sign of a hanging operation.
  it('syncs filings from SEC and prevents duplicates on a second sync', async () => {
    const { listFilings } = await import('./secFilingService');
    const { getSubmissions } = await import('@/lib/providers/secEdgar');

    const first = await listFilings(TEST_TICKER);
    expect(first).toHaveLength(2);
    expect(first.map((f) => f.filingType).sort()).toEqual(['EIGHT_K', 'TEN_K']);

    const company = await db.company.findUniqueOrThrow({ where: { ticker: TEST_TICKER } });
    const rowCountAfterFirst = await db.secFiling.count({ where: { companyId: company.id } });
    expect(rowCountAfterFirst).toBe(2);

    // Force the TTL to have expired and sync again — the unique constraint
    // on (companyId, accessionNumber) must prevent duplicate rows.
    await db.secFiling.updateMany({ where: { companyId: company.id }, data: { createdAt: new Date(0) } });
    await listFilings(TEST_TICKER);

    const rowCountAfterSecond = await db.secFiling.count({ where: { companyId: company.id } });
    expect(rowCountAfterSecond).toBe(2);
    expect(vi.mocked(getSubmissions).mock.calls.length).toBe(2); // one call per sync, both honored
  }, 20000);

  it('processes a filing into sections and never re-fetches an already-COMPLETE filing', async () => {
    const { listFilings, processFiling } = await import('./secFilingService');
    const { getFilingDocument } = await import('@/lib/providers/secEdgar');

    const filings = await listFilings(TEST_TICKER);
    const tenK = filings.find((f) => f.filingType === 'TEN_K');
    if (!tenK) throw new Error('fixture 10-K not found');

    const processed = await processFiling(tenK.id);
    expect(processed.processingStatus).toBe('COMPLETE');

    const sections = await db.filingSection.findMany({ where: { filingId: tenK.id } });
    expect(sections.map((s) => s.sectionType).sort()).toEqual(['BUSINESS', 'RISK_FACTORS']);
    expect(sections.find((s) => s.sectionType === 'RISK_FACTORS')?.content).toContain('fixtures are not realistic');

    const callCountBefore = vi.mocked(getFilingDocument).mock.calls.length;
    await processFiling(tenK.id); // already COMPLETE — must not re-fetch
    expect(vi.mocked(getFilingDocument).mock.calls.length).toBe(callCountBefore);
  });

  it('caches AI analysis and only regenerates when explicitly requested', async () => {
    const { listFilings, getOrCreateFilingAnalysis } = await import('./secFilingService');
    const { requestStructuredCompletion } = await import('@/lib/ai/anthropicClient');

    const filings = await listFilings(TEST_TICKER);
    const tenK = filings.find((f) => f.filingType === 'TEN_K');
    if (!tenK) throw new Error('fixture 10-K not found');

    const first = await getOrCreateFilingAnalysis(tenK.id);
    expect(first.status).toBe('SUCCESS');
    expect(first.summary).toContain('steady results');
    const callsAfterFirst = vi.mocked(requestStructuredCompletion).mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Viewing again must NOT call the AI provider again.
    const second = await getOrCreateFilingAnalysis(tenK.id);
    expect(second.id).toBe(first.id);
    expect(vi.mocked(requestStructuredCompletion).mock.calls.length).toBe(callsAfterFirst);

    // Only an explicit regenerate triggers another call.
    await getOrCreateFilingAnalysis(tenK.id, { regenerate: true });
    expect(vi.mocked(requestStructuredCompletion).mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('finds text within a processed filing via search', async () => {
    const { listFilings, searchFiling } = await import('./secFilingService');
    const filings = await listFilings(TEST_TICKER);
    const tenK = filings.find((f) => f.filingType === 'TEN_K');
    if (!tenK) throw new Error('fixture 10-K not found');

    const results = await searchFiling(tenK.id, 'automated testing');
    expect(results).toHaveLength(1);
    expect(results[0]?.sectionType).toBe('BUSINESS');
  });
});
