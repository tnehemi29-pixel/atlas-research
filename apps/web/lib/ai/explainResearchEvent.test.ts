import { afterEach, describe, expect, it, vi } from 'vitest';
import { explainResearchEvent } from './explainResearchEvent';
import * as anthropicClient from './anthropicClient';
import type { ResearchEventPromptInput } from './researchEventPrompts';

function validResponse() {
  return {
    data: {
      summary: 'Management lowered full-year revenue guidance.',
      why_it_matters: 'The revised guidance is below the growth assumption used in the research report.',
      affected_research_areas: ['FINANCIALS', 'DCF'],
      questions_to_investigate: ['What drove the guidance cut?'],
      confidence: 'high',
    },
    model: 'claude-sonnet-4-5',
    inputTokens: 300,
    outputTokens: 120,
  };
}

function makeInput(): ResearchEventPromptInput {
  return {
    companyName: 'Acme Corp',
    ticker: 'ACME',
    category: 'EARNINGS',
    materiality: 'HIGH',
    eventTitle: 'Revenue guidance lowered',
    eventDescription: 'Management lowered full-year revenue guidance from $11.0B to $10.2B.',
    changes: [{ metric: 'Revenue Guidance', unit: 'usd', previousValue: 11_000_000_000, currentValue: 10_200_000_000, changePercent: -0.0727 }],
    deterministicImpacts: [{ area: 'DCF', note: 'Potentially affects DCF revenue assumptions.' }],
    sources: [{ type: 'EARNINGS_CALL', label: 'Q3 2026 Earnings Call' }],
  };
}

describe('explainResearchEvent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the event context and returns the validated payload', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse());

    const result = await explainResearchEvent(makeInput());

    expect(result.payload.summary).toContain('guidance');
    expect(result.inputTokens).toBe(300);
    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Acme Corp');
    expect(userPrompt).toContain('Revenue Guidance');
  });

  it('propagates AiNotConfiguredError untouched', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockRejectedValue(new anthropicClient.AiNotConfiguredError());
    await expect(explainResearchEvent(makeInput())).rejects.toBeInstanceOf(anthropicClient.AiNotConfiguredError);
  });
});
