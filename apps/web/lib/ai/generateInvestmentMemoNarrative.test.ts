import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateInvestmentMemoNarrative, sanitizeMemoNarrativePayload } from './generateInvestmentMemoNarrative';
import * as anthropicClient from './anthropicClient';
import type { InvestmentMemoPromptInput } from './investmentMemoPrompts';
import type { InvestmentCaseContext } from '@/lib/investmentCase/context';

function makeContext(): InvestmentCaseContext {
  return {
    caseId: 'case-1',
    ticker: 'ACME',
    companyName: 'Acme Corp',
    businessOverview: { exchange: 'NASDAQ', sector: 'Technology', industry: 'Software', country: 'US', marketCap: 500_000_000_000 },
    status: 'ACTIVE_THESIS',
    horizon: '3-5 years',
    coreThesis: 'Cloud growth drives FCF expansion.',
    keyDrivers: ['Cloud growth'],
    bullSummary: null,
    baseSummary: null,
    bearSummary: null,
    strengthenIndicators: [],
    weakenIndicators: [],
    invalidateIndicators: [],
    assumptions: [],
    evidence: [{ id: 'ev-real-1', claim: 'Cloud growth strong', evidence: 'Q2 up 20%', date: '2026-01-01', category: 'Growth', direction: 'SUPPORTS', strength: 'HIGH', sourceType: 'EARNINGS_CALL', sourceLabel: 'Q2 call' }],
    risks: [],
    catalysts: [],
    invalidationCriteria: [],
    financials: { revenue: 100_000_000, revenueGrowth: 0.1, operatingMargin: 0.25, freeCashFlow: 20_000_000 },
    valuation: { currentSharePrice: 100, dcfBase: 120, dcfBull: 140, dcfBear: 90, compsImplied: 115, evToEbitda: 12, peRatio: 25 },
    challenges: [],
    invalidationEvaluations: [],
    recentResearchEvents: [{ id: 'event-real-1', type: 'GUIDANCE_CHANGE', title: 'Guidance raised', materiality: 'HIGH', eventDate: '2026-02-01' }],
    generatedAt: '2026-02-01T00:00:00.000Z',
  };
}

function makeInput(): InvestmentMemoPromptInput {
  return { context: makeContext() };
}

function validResponse(evidenceIds: string[] = ['ev-real-1'], eventIds: string[] = ['event-real-1']) {
  return {
    data: {
      executive_summary: { text: 'Acme shows strong cloud growth supporting the thesis.', cited_evidence_ids: evidenceIds, cited_research_event_ids: eventIds },
      conclusion: { text: 'The thesis remains intact pending continued execution.', cited_evidence_ids: evidenceIds, cited_research_event_ids: [] },
    },
    model: 'claude-sonnet-4-5',
    inputTokens: 600,
    outputTokens: 150,
  };
}

describe('generateInvestmentMemoNarrative', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the full case context and returns the validated two-section payload', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse());
    const validIds = new Set(['ev-real-1', 'event-real-1']);

    const result = await generateInvestmentMemoNarrative(makeInput(), validIds);

    expect(result.payload.executive_summary.text).toContain('cloud growth');
    expect(result.payload.conclusion.text).toContain('thesis');
    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Acme Corp');
    expect(userPrompt).toContain('ev-real-1');
  });

  it('strips a fabricated citation from either section — the AI cannot cite a source that does not exist', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse(['ev-real-1', 'ev-fake'], ['event-real-1', 'event-fake']));
    const validIds = new Set(['ev-real-1', 'event-real-1']);

    const result = await generateInvestmentMemoNarrative(makeInput(), validIds);

    expect(result.payload.executive_summary.cited_evidence_ids).toEqual(['ev-real-1']);
    expect(result.payload.executive_summary.cited_research_event_ids).toEqual(['event-real-1']);
  });

  it('propagates AiNotConfiguredError untouched (the service layer decides how to degrade)', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockRejectedValue(new anthropicClient.AiNotConfiguredError());
    await expect(generateInvestmentMemoNarrative(makeInput(), new Set())).rejects.toBeInstanceOf(anthropicClient.AiNotConfiguredError);
  });
});

describe('sanitizeMemoNarrativePayload', () => {
  it('sanitizes both sections independently', () => {
    const sanitized = sanitizeMemoNarrativePayload(
      {
        executive_summary: { text: 'a', cited_evidence_ids: ['real', 'fake'], cited_research_event_ids: [] },
        conclusion: { text: 'b', cited_evidence_ids: [], cited_research_event_ids: ['fake-event'] },
      },
      new Set(['real']),
    );
    expect(sanitized.executive_summary.cited_evidence_ids).toEqual(['real']);
    expect(sanitized.conclusion.cited_research_event_ids).toEqual([]);
  });
});
