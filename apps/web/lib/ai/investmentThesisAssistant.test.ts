import { afterEach, describe, expect, it, vi } from 'vitest';
import { askInvestmentThesisAssistant, sanitizeThesisAssistantPayload } from './investmentThesisAssistant';
import * as anthropicClient from './anthropicClient';
import type { InvestmentThesisPromptInput } from './investmentThesisPrompts';
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
    assumptions: [{ metric: 'REVENUE_CAGR', scenario: 'BASE', label: 'Revenue CAGR', value: 0.12, unit: 'ratio', confidence: 'MEDIUM' }],
    evidence: [{ id: 'ev-real-1', claim: 'Cloud growth strong', evidence: 'Q2 revenue up 20%', date: '2026-01-01', category: 'Growth', direction: 'SUPPORTS', strength: 'HIGH', sourceType: 'EARNINGS_CALL', sourceLabel: 'Q2 call' }],
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

function makeInput(): InvestmentThesisPromptInput {
  return { context: makeContext(), question: 'What supports my thesis?' };
}

function validResponse(citedEvidenceIds: string[] = ['ev-real-1'], citedResearchEventIds: string[] = ['event-real-1']) {
  return {
    data: { answer: 'Cloud growth has accelerated, supporting the thesis.', cited_evidence_ids: citedEvidenceIds, cited_research_event_ids: citedResearchEventIds, caveats: [] },
    model: 'claude-sonnet-4-5',
    inputTokens: 500,
    outputTokens: 80,
  };
}

describe('askInvestmentThesisAssistant', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the full case context and returns the validated payload', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse());
    const input = makeInput();
    const validIds = new Set(['ev-real-1', 'event-real-1']);

    const result = await askInvestmentThesisAssistant(input, validIds);

    expect(result.payload.answer).toContain('Cloud growth');
    expect(result.payload.cited_evidence_ids).toEqual(['ev-real-1']);
    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Acme Corp');
    expect(userPrompt).toContain('ev-real-1');
    expect(userPrompt).toContain('What supports my thesis?');
  });

  it('strips a cited id the model invents that is not in the real context — the AI cannot fabricate a citation', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse(['ev-real-1', 'ev-made-up'], ['event-real-1', 'event-made-up']));
    const validIds = new Set(['ev-real-1', 'event-real-1']);

    const result = await askInvestmentThesisAssistant(makeInput(), validIds);

    expect(result.payload.cited_evidence_ids).toEqual(['ev-real-1']);
    expect(result.payload.cited_research_event_ids).toEqual(['event-real-1']);
  });

  it('propagates AiNotConfiguredError untouched', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockRejectedValue(new anthropicClient.AiNotConfiguredError());
    await expect(askInvestmentThesisAssistant(makeInput(), new Set())).rejects.toBeInstanceOf(anthropicClient.AiNotConfiguredError);
  });
});

describe('sanitizeThesisAssistantPayload', () => {
  it('removes every id not present in the valid set, from both citation arrays', () => {
    const sanitized = sanitizeThesisAssistantPayload(
      { answer: 'x', cited_evidence_ids: ['real', 'fake'], cited_research_event_ids: ['fake2'], caveats: [] },
      new Set(['real']),
    );
    expect(sanitized.cited_evidence_ids).toEqual(['real']);
    expect(sanitized.cited_research_event_ids).toEqual([]);
  });
});
