import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchContext } from '@/lib/research/types';
import { generateResearchReport } from './generateResearchReport';
import type { ResearchReportAiPayload } from './reportSchema';
import * as anthropicClient from './anthropicClient';

function makeContext(sourceCount: number): ResearchContext {
  const sources = Array.from({ length: sourceCount }, (_, i) => ({
    id: i + 1,
    type: 'FINANCIAL_STATEMENT' as const,
    label: `Source ${i + 1}`,
    detail: null,
  }));

  return {
    ticker: 'ACME',
    companyOverview: {
      ticker: 'ACME',
      name: 'Acme Corp',
      sector: 'Technology',
      industry: 'Software',
      exchange: 'NASDAQ',
      country: 'US',
      price: 100,
      marketCap: 1_000_000_000,
      enterpriseValue: 1_100_000_000,
      beta: 1.1,
      yearHigh: 120,
      yearLow: 80,
      quoteStale: false,
    },
    financialPerformance: { periodType: 'annual', metrics: [], dataAsOf: null, stale: false, sourceId: 1 },
    dcfAnalysis: null,
    compsAnalysis: null,
    secFilingContext: null,
    earningsContext: null,
    keyMetrics: [],
    sources,
    dataSnapshotAt: '2026-08-10T00:00:00.000Z',
    warnings: [],
  };
}

function validAiResponse(sourceIds: number[]): { data: ResearchReportAiPayload; model: string; inputTokens: number; outputTokens: number } {
  return {
    data: {
      executive_summary: { text: 'Steady growth with expanding margins.', source_ids: sourceIds },
      company_overview_narrative: { text: 'A diversified technology company.', source_ids: sourceIds },
      financial_analysis_narrative: { text: 'Revenue accelerated while margins expanded.', source_ids: sourceIds },
      growth_analysis: { drivers: [] },
      valuation_commentary: { text: 'DCF and comps are broadly consistent.', source_ids: sourceIds },
      dcf_commentary: { text: 'The Base case implies modest upside.', source_ids: sourceIds },
      comps_commentary: { text: 'Trades near the peer median.', source_ids: sourceIds },
      sec_analysis: { insights: [] },
      earnings_analysis: { insights: [] },
      catalysts: [],
      risks: [],
      management_capital_allocation: { text: 'Management emphasized buybacks.', source_ids: sourceIds },
      scenario_commentary: { text: 'The Bull case assumes faster margin expansion.', source_ids: sourceIds },
      conclusion: {
        what_is_working: 'Revenue growth.',
        what_is_deteriorating: 'Insufficient data to determine.',
        valuation_implication: 'Valuation is highly sensitive to the terminal growth assumption.',
        key_assumptions: 'WACC and terminal growth drive most of the implied value.',
        what_could_change_thesis: 'A material deceleration in revenue growth.',
        source_ids: sourceIds,
      },
    },
    model: 'claude-sonnet-4-5',
    inputTokens: 800,
    outputTokens: 400,
  };
}

describe('generateResearchReport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the validated payload and token usage when every cited source is real', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validAiResponse([1, 2]));

    const result = await generateResearchReport(makeContext(3));

    expect(result.payload.executive_summary.source_ids).toEqual([1, 2]);
    expect(result.inputTokens).toBe(800);
    expect(result.model).toBe('claude-sonnet-4-5');
  });

  it('strips a source_id the model invented that does not exist in the registry', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validAiResponse([1, 99]));

    const result = await generateResearchReport(makeContext(3));

    expect(result.payload.executive_summary.source_ids).toEqual([1]);
    expect(result.payload.conclusion.source_ids).toEqual([1]);
  });

  it('strips invented source_ids from nested category items (risks, catalysts, growth drivers)', async () => {
    const response = validAiResponse([1]);
    response.data.risks = [
      { category: 'competitive', risk: 'Rising competition.', why_it_matters: 'Pricing pressure.', evidence: 'Noted on the call.', source_ids: [1, 50] },
    ];
    response.data.catalysts = [{ category: 'earnings', description: 'Potential catalyst: next earnings report.', source_ids: [42] }];
    response.data.growth_analysis.drivers = [{ category: 'pricing', description: 'Pricing power supported growth.', source_ids: [2, 7] }];
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(response);

    const result = await generateResearchReport(makeContext(3));

    expect(result.payload.risks[0]?.source_ids).toEqual([1]);
    expect(result.payload.catalysts[0]?.source_ids).toEqual([]);
    expect(result.payload.growth_analysis.drivers[0]?.source_ids).toEqual([2]);
  });

  it('propagates AiNotConfiguredError untouched when no API key is set', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockRejectedValue(new anthropicClient.AiNotConfiguredError());

    await expect(generateResearchReport(makeContext(3))).rejects.toBeInstanceOf(anthropicClient.AiNotConfiguredError);
  });
});
