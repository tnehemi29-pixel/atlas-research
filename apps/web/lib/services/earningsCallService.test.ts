import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import type { SecCompanyFacts, SecXbrlFact } from '@/lib/providers/secEdgar';

/**
 * Integration test against the real local Postgres — same rationale as
 * secFilingService.test.ts: duplicate prevention and guidance-change
 * resolution are claims about actual unique constraints and stored data, not
 * something a mock can verify. SEC (financial data), FMP (transcripts), and
 * the LLM are the only things mocked. Uses a ticker that can't collide with
 * a real company, and cleans up everything it creates afterward.
 */

function fact(partial: Partial<SecXbrlFact> & Pick<SecXbrlFact, 'end' | 'val' | 'accn' | 'form' | 'filed'>): SecXbrlFact {
  return partial;
}

// Three consecutive quarters (Q1-Q3 2025) with clean, hand-verifiable
// figures — enough for the quarterly period calendar to rank them correctly
// (see lib/xbrl/periods.ts) without needing a full annual fact.
const QUARTERLY_FACTS: SecCompanyFacts = {
  cik: 2,
  entityName: 'Fixture Earnings Co.',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            fact({ start: '2025-01-01', end: '2025-03-31', val: 100_000_000_000, accn: 'FIX-25-01', form: '10-Q', filed: '2025-04-15' }),
            fact({ start: '2025-04-01', end: '2025-06-30', val: 105_000_000_000, accn: 'FIX-25-02', form: '10-Q', filed: '2025-07-15' }),
            fact({ start: '2025-07-01', end: '2025-09-28', val: 110_000_000_000, accn: 'FIX-25-03', form: '10-Q', filed: '2025-10-15' }),
          ],
        },
      },
      GrossProfit: {
        units: {
          USD: [
            fact({ start: '2025-01-01', end: '2025-03-31', val: 60_000_000_000, accn: 'FIX-25-01', form: '10-Q', filed: '2025-04-15' }),
            fact({ start: '2025-04-01', end: '2025-06-30', val: 63_000_000_000, accn: 'FIX-25-02', form: '10-Q', filed: '2025-07-15' }),
            fact({ start: '2025-07-01', end: '2025-09-28', val: 66_000_000_000, accn: 'FIX-25-03', form: '10-Q', filed: '2025-10-15' }),
          ],
        },
      },
      OperatingIncomeLoss: {
        units: {
          USD: [
            fact({ start: '2025-01-01', end: '2025-03-31', val: 30_000_000_000, accn: 'FIX-25-01', form: '10-Q', filed: '2025-04-15' }),
            fact({ start: '2025-04-01', end: '2025-06-30', val: 32_000_000_000, accn: 'FIX-25-02', form: '10-Q', filed: '2025-07-15' }),
            fact({ start: '2025-07-01', end: '2025-09-28', val: 34_000_000_000, accn: 'FIX-25-03', form: '10-Q', filed: '2025-10-15' }),
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            fact({ start: '2025-01-01', end: '2025-03-31', val: 20_000_000_000, accn: 'FIX-25-01', form: '10-Q', filed: '2025-04-15' }),
            fact({ start: '2025-04-01', end: '2025-06-30', val: 21_000_000_000, accn: 'FIX-25-02', form: '10-Q', filed: '2025-07-15' }),
            fact({ start: '2025-07-01', end: '2025-09-28', val: 23_000_000_000, accn: 'FIX-25-03', form: '10-Q', filed: '2025-10-15' }),
          ],
        },
      },
      EarningsPerShareDiluted: {
        units: {
          'USD/shares': [
            fact({ start: '2025-01-01', end: '2025-03-31', val: 1.0, accn: 'FIX-25-01', form: '10-Q', filed: '2025-04-15' }),
            fact({ start: '2025-04-01', end: '2025-06-30', val: 1.05, accn: 'FIX-25-02', form: '10-Q', filed: '2025-07-15' }),
            fact({ start: '2025-07-01', end: '2025-09-28', val: 1.15, accn: 'FIX-25-03', form: '10-Q', filed: '2025-10-15' }),
          ],
        },
      },
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            fact({ start: '2025-01-01', end: '2025-03-31', val: 25_000_000_000, accn: 'FIX-25-01', form: '10-Q', filed: '2025-04-15' }),
            fact({ start: '2025-04-01', end: '2025-06-30', val: 26_000_000_000, accn: 'FIX-25-02', form: '10-Q', filed: '2025-07-15' }),
            fact({ start: '2025-07-01', end: '2025-09-28', val: 28_000_000_000, accn: 'FIX-25-03', form: '10-Q', filed: '2025-10-15' }),
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: {
          USD: [
            fact({ start: '2025-01-01', end: '2025-03-31', val: 5_000_000_000, accn: 'FIX-25-01', form: '10-Q', filed: '2025-04-15' }),
            fact({ start: '2025-04-01', end: '2025-06-30', val: 5_000_000_000, accn: 'FIX-25-02', form: '10-Q', filed: '2025-07-15' }),
            fact({ start: '2025-07-01', end: '2025-09-28', val: 6_000_000_000, accn: 'FIX-25-03', form: '10-Q', filed: '2025-10-15' }),
          ],
        },
      },
    },
  },
};

function transcriptFor(quarter: number): string {
  return [
    `Operator: Good day, and welcome to the Fixture Earnings Co. Q${quarter} 2025 earnings call.`,
    '',
    'Alex Chen: Thank you. We delivered solid results in the quarter, with demand remaining healthy across our core markets.',
    '',
    'Operator: We will now begin the question-and-answer session.',
    '',
    'Sam Patel - Meridian Securities: How is demand trending heading into next quarter?',
    '',
    'Alex Chen: Demand remains healthy and we are optimistic about the trajectory.',
  ].join('\n');
}

vi.mock('@/lib/providers/secEdgar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers/secEdgar')>();
  return {
    ...actual,
    resolveCik: vi.fn().mockResolvedValue({ cik: '0000000002', name: 'Fixture Earnings Co.' }),
    getCompanyFacts: vi.fn().mockResolvedValue(QUARTERLY_FACTS),
  };
});

vi.mock('@/lib/providers/fmp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers/fmp')>();
  return {
    ...actual,
    getEarningsCallTranscriptFmp: vi.fn().mockImplementation(async (ticker: string, fiscalYear: number, quarter: number) => {
      // Q1 deliberately has no transcript — exercises the graceful
      // "Transcript unavailable" path alongside the two quarters that do.
      if (fiscalYear === 2025 && (quarter === 2 || quarter === 3)) {
        return { ticker, fiscalYear, quarter, callDate: `2025-0${quarter === 2 ? 7 : 10}-15`, content: transcriptFor(quarter) };
      }
      return null;
    }),
  };
});

vi.mock('@/lib/ai/anthropicClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/anthropicClient')>();
  return {
    ...actual,
    requestStructuredCompletion: vi.fn().mockImplementation(async (params: { user: string }) => {
      if (params.user.includes('Call: Q2 2025')) {
        return {
          data: {
            summary: 'Q2 2025 fixture summary: steady demand.',
            business_trends: [],
            management_commentary: [],
            guidance_observations: [
              {
                metric: 'REVENUE',
                metric_label: 'Full Year Revenue',
                period: 'FY2025',
                low: 400,
                high: 410,
                source: { speaker: 'Alex Chen (CEO)', excerpt: 'we delivered solid results in the quarter' },
              },
            ],
            risks: [],
            capital_allocation: [],
            analyst_topics: [],
            management_language: [],
          },
          model: 'claude-sonnet-4-5-fixture',
          inputTokens: 500,
          outputTokens: 200,
        };
      }

      if (params.user.includes('Call: Q3 2025')) {
        return {
          data: {
            summary: 'Q3 2025 fixture summary: guidance raised.',
            business_trends: [],
            management_commentary: [],
            guidance_observations: [
              {
                metric: 'REVENUE',
                metric_label: 'Full Year Revenue',
                period: 'FY2025',
                low: 410,
                high: 420,
                source: { speaker: 'Alex Chen (CEO)', excerpt: 'we are optimistic about the trajectory' },
              },
            ],
            risks: [],
            capital_allocation: [],
            analyst_topics: [],
            management_language: [],
          },
          model: 'claude-sonnet-4-5-fixture',
          inputTokens: 600,
          outputTokens: 250,
        };
      }

      return { data: { language_changes: [], tone_comparison: [] }, model: 'claude-sonnet-4-5-fixture', inputTokens: 300, outputTokens: 100 };
    }),
  };
});

const TEST_TICKER = 'ZZEARNINGSTEST';

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TEST_TICKER } });
}

describe('earningsCallService — real database integration', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  // A higher-than-default timeout: this file's first Postgres query pays a
  // one-time connection-warmup cost, not a sign of a hanging operation.
  it('derives earnings calls from quarterly financial data and prevents duplicates on a second sync', async () => {
    const { listEarningsCalls } = await import('./earningsCallService');

    const first = await listEarningsCalls(TEST_TICKER);
    expect(first).toHaveLength(3);
    expect(first.map((c) => c.fiscalQuarter).sort()).toEqual([1, 2, 3]);
    expect(first.every((c) => c.fiscalYear === 2025)).toBe(true);

    const company = await db.company.findUniqueOrThrow({ where: { ticker: TEST_TICKER } });
    const rowCountAfterFirst = await db.earningsCall.count({ where: { companyId: company.id } });
    expect(rowCountAfterFirst).toBe(3);

    await listEarningsCalls(TEST_TICKER);
    const rowCountAfterSecond = await db.earningsCall.count({ where: { companyId: company.id } });
    expect(rowCountAfterSecond).toBe(3);
  }, 20000);

  it('processes a call with a transcript into segments, and marks one with no transcript UNAVAILABLE', async () => {
    const { listEarningsCalls, processCall } = await import('./earningsCallService');
    const { getEarningsCallTranscriptFmp } = await import('@/lib/providers/fmp');

    const calls = await listEarningsCalls(TEST_TICKER);
    const q1 = calls.find((c) => c.fiscalQuarter === 1);
    const q3 = calls.find((c) => c.fiscalQuarter === 3);
    if (!q1 || !q3) throw new Error('fixture calls not found');

    const processedQ1 = await processCall(q1.id);
    expect(processedQ1.processingStatus).toBe('UNAVAILABLE');
    expect(processedQ1.processingError).toBeTruthy();

    const processedQ3 = await processCall(q3.id);
    expect(processedQ3.processingStatus).toBe('COMPLETE');

    const transcript = await db.transcript.findUnique({ where: { earningsCallId: q3.id } });
    expect(transcript).not.toBeNull();
    const segments = await db.transcriptSegment.findMany({ where: { transcriptId: transcript!.id } });
    expect(segments.some((s) => s.speakerType === 'EXECUTIVE')).toBe(true);
    expect(segments.some((s) => s.speakerType === 'ANALYST')).toBe(true);

    const callCountBefore = vi.mocked(getEarningsCallTranscriptFmp).mock.calls.length;
    await processCall(q3.id); // already COMPLETE — must not re-fetch
    expect(vi.mocked(getEarningsCallTranscriptFmp).mock.calls.length).toBe(callCountBefore);
  });

  it('resolves guidance deterministically across two calls (NEW, then INCREASED) and caches AI analysis', async () => {
    const { listEarningsCalls, getOrCreateEarningsAnalysis } = await import('./earningsCallService');
    const { requestStructuredCompletion } = await import('@/lib/ai/anthropicClient');

    const calls = await listEarningsCalls(TEST_TICKER);
    const q2 = calls.find((c) => c.fiscalQuarter === 2);
    const q3 = calls.find((c) => c.fiscalQuarter === 3);
    if (!q2 || !q3) throw new Error('fixture calls not found');

    // Q2 first — no prior guidance exists yet, so the change must be NEW.
    const q2Analysis = await getOrCreateEarningsAnalysis(q2.id);
    expect(q2Analysis.status).toBe('SUCCESS');
    const q2Guidance = await db.guidanceObservation.findMany({ where: { earningsCallId: q2.id } });
    expect(q2Guidance).toHaveLength(1);
    expect(q2Guidance[0]?.midpoint).toBeCloseTo(405, 5);
    expect(q2Guidance[0]?.change).toBe('NEW');

    // Q3 next — Q2's guidance is now the prior, midpoint rose 405 -> 415.
    const q3Analysis = await getOrCreateEarningsAnalysis(q3.id);
    expect(q3Analysis.status).toBe('SUCCESS');
    const q3Guidance = await db.guidanceObservation.findMany({ where: { earningsCallId: q3.id } });
    expect(q3Guidance).toHaveLength(1);
    expect(q3Guidance[0]?.midpoint).toBeCloseTo(415, 5);
    expect(q3Guidance[0]?.priorMidpoint).toBeCloseTo(405, 5);
    expect(q3Guidance[0]?.change).toBe('INCREASED');

    // Viewing again must NOT call the AI provider again.
    const callsAfterBoth = vi.mocked(requestStructuredCompletion).mock.calls.length;
    const q3Again = await getOrCreateEarningsAnalysis(q3.id);
    expect(q3Again.id).toBe(q3Analysis.id);
    expect(vi.mocked(requestStructuredCompletion).mock.calls.length).toBe(callsAfterBoth);

    // Only an explicit regenerate triggers another call.
    await getOrCreateEarningsAnalysis(q3.id, { regenerate: true });
    expect(vi.mocked(requestStructuredCompletion).mock.calls.length).toBeGreaterThan(callsAfterBoth);
  });

  it('finds text within a processed call via search', async () => {
    const { listEarningsCalls, searchCall } = await import('./earningsCallService');
    const calls = await listEarningsCalls(TEST_TICKER);
    const q3 = calls.find((c) => c.fiscalQuarter === 3);
    if (!q3) throw new Error('fixture call not found');

    const results = await searchCall(q3.id, 'demand remains healthy');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.speakerName).toBe('Alex Chen');
  });

  it('gracefully returns null when no matching SEC filing exists for a cross-source comparison', async () => {
    const { listEarningsCalls, findMatchingSecFiling } = await import('./earningsCallService');
    const calls = await listEarningsCalls(TEST_TICKER);
    const q3 = calls.find((c) => c.fiscalQuarter === 3);
    if (!q3) throw new Error('fixture call not found');

    const filing = await findMatchingSecFiling(q3.companyId, q3);
    expect(filing).toBeNull();
  });
});
