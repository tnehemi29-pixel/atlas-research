import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { AiNotConfiguredError } from '@/lib/ai/anthropicClient';
import type { ResearchContext } from '@/lib/research/types';
import type { ResearchReportAiPayload } from '@/lib/ai/reportSchema';

/**
 * Integration test against the real local Postgres — versioning (never
 * overwriting a prior report, incrementing per company) is a claim about
 * actual unique-constraint and ordering behavior, not something a mock can
 * verify. The research-data aggregation pipeline (lib/research/aggregateResearchContext.ts,
 * covered by its own tests) and the AI narrative generation
 * (lib/ai/generateResearchReport.ts, covered by its own tests) are mocked
 * here — this file only tests what researchReportService.ts itself is
 * responsible for: persistence and version sequencing.
 */

vi.mock('@/lib/research/aggregateResearchContext', () => ({
  aggregateResearchContext: vi.fn(),
}));
vi.mock('@/lib/ai/generateResearchReport', () => ({
  generateResearchReport: vi.fn(),
}));

import { aggregateResearchContext } from '@/lib/research/aggregateResearchContext';
import { generateResearchReport } from '@/lib/ai/generateResearchReport';
import { createReport, getLatestReport, getReport, listReports, ResearchReportNotFoundError } from './researchReportService';

const TEST_TICKER = 'ZZREPORTTEST';

function makeContext(): ResearchContext {
  return {
    ticker: TEST_TICKER,
    companyOverview: {
      ticker: TEST_TICKER,
      name: 'Fixture Report Co.',
      sector: 'Technology',
      industry: 'Software',
      exchange: 'NASDAQ',
      country: 'US',
      price: 50,
      marketCap: 500_000_000,
      enterpriseValue: 520_000_000,
      beta: 1.0,
      yearHigh: 60,
      yearLow: 40,
      quoteStale: false,
    },
    financialPerformance: { periodType: 'annual', metrics: [], dataAsOf: null, stale: false, sourceId: 1 },
    dcfAnalysis: null,
    compsAnalysis: null,
    secFilingContext: null,
    earningsContext: null,
    keyMetrics: [],
    sources: [{ id: 1, type: 'FINANCIAL_STATEMENT', label: 'Fixture financials', detail: null }],
    dataSnapshotAt: '2026-08-01T00:00:00.000Z',
    warnings: [],
  };
}

function makePayload(): ResearchReportAiPayload {
  return {
    executive_summary: { text: 'Steady performance.', source_ids: [1] },
    company_overview_narrative: { text: 'A fixture software company.', source_ids: [1] },
    financial_analysis_narrative: { text: 'Revenue grew steadily.', source_ids: [1] },
    growth_analysis: { drivers: [] },
    valuation_commentary: { text: 'Valuation is consistent across methods.', source_ids: [1] },
    dcf_commentary: { text: 'Base case implies modest upside.', source_ids: [1] },
    comps_commentary: { text: 'Trades near peer median.', source_ids: [1] },
    sec_analysis: { insights: [] },
    earnings_analysis: { insights: [] },
    catalysts: [],
    risks: [],
    management_capital_allocation: { text: 'Management is disciplined.', source_ids: [1] },
    scenario_commentary: { text: 'Bull case assumes faster growth.', source_ids: [1] },
    conclusion: {
      what_is_working: 'Revenue growth.',
      what_is_deteriorating: 'Insufficient data to determine.',
      valuation_implication: 'Valuation is highly sensitive to margin assumptions.',
      key_assumptions: 'Margin trajectory drives most of the implied value.',
      what_could_change_thesis: 'A material margin miss.',
      source_ids: [1],
    },
  };
}

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TEST_TICKER } });
}

describe('researchReportService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  beforeEach(() => {
    vi.mocked(aggregateResearchContext).mockReset();
    vi.mocked(generateResearchReport).mockReset();
  });

  it('creates version 1 for a new company and persists the merged content', async () => {
    vi.mocked(aggregateResearchContext).mockResolvedValue(makeContext());
    vi.mocked(generateResearchReport).mockResolvedValue({
      payload: makePayload(),
      model: 'claude-sonnet-4-5',
      inputTokens: 900,
      outputTokens: 300,
    });

    const report = await createReport(TEST_TICKER);

    expect(report.version).toBe(1);
    expect(report.status).toBe('SUCCESS');
    expect(report.model).toBe('claude-sonnet-4-5');
    expect(report.inputTokens).toBe(900);
    expect(report.dataSnapshotAt.toISOString()).toBe('2026-08-01T00:00:00.000Z');

    const content = report.content as unknown as { context: ResearchContext; report: ResearchReportAiPayload };
    expect(content.context.ticker).toBe(TEST_TICKER);
    expect(content.report.executive_summary.text).toBe('Steady performance.');
  });

  it('increments the version on a second generation without deleting the first', async () => {
    vi.mocked(aggregateResearchContext).mockResolvedValue(makeContext());
    vi.mocked(generateResearchReport).mockResolvedValue({
      payload: makePayload(),
      model: 'claude-sonnet-4-5',
      inputTokens: 100,
      outputTokens: 50,
    });

    const second = await createReport(TEST_TICKER);
    expect(second.version).toBe(2);

    const all = await listReports(TEST_TICKER);
    expect(all.map((r) => r.version)).toEqual([2, 1]);
  });

  it('persists a FAILED version rather than throwing when the AI is not configured', async () => {
    vi.mocked(aggregateResearchContext).mockResolvedValue(makeContext());
    vi.mocked(generateResearchReport).mockRejectedValue(new AiNotConfiguredError());

    const report = await createReport(TEST_TICKER);

    expect(report.version).toBe(3);
    expect(report.status).toBe('FAILED');
    expect(report.error).toBe('ANTHROPIC_API_KEY is not configured');
    expect(report.model).toBe('none');

    const content = report.content as unknown as { context: ResearchContext; report: ResearchReportAiPayload | null };
    expect(content.report).toBeNull();
    expect(content.context.ticker).toBe(TEST_TICKER);
  });

  it('getLatestReport returns the highest version', async () => {
    const latest = await getLatestReport(TEST_TICKER);
    expect(latest?.version).toBe(3);
  });

  it('getLatestReport returns null for a company with no reports', async () => {
    const latest = await getLatestReport('ZZNONEXISTENTTICKER');
    expect(latest).toBeNull();
  });

  it('getReport returns a specific version by id', async () => {
    const all = await listReports(TEST_TICKER);
    const firstVersion = all.find((r) => r.version === 1)!;

    const fetched = await getReport(firstVersion.id);
    expect(fetched.version).toBe(1);
  });

  it('getReport throws ResearchReportNotFoundError for an unknown id', async () => {
    await expect(getReport('does-not-exist')).rejects.toBeInstanceOf(ResearchReportNotFoundError);
  });
});
