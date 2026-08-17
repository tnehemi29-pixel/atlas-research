import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeFiling } from './analyzeFiling';
import * as anthropicClient from './anthropicClient';

function validAnalysisResponse() {
  return {
    data: {
      summary: 'The company reported solid results.',
      key_changes: [],
      risks: [],
      management_commentary: [],
      capital_allocation: [],
      accounting_changes: [],
    },
    model: 'claude-sonnet-4-5',
    inputTokens: 500,
    outputTokens: 200,
  };
}

describe('analyzeFiling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends only analysis-relevant sections to the model, excluding FINANCIAL_STATEMENTS', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validAnalysisResponse());

    await analyzeFiling({
      companyName: 'Acme Corp',
      formType: '10-K',
      filingDate: '2024-11-01',
      sections: [
        { sectionType: 'RISK_FACTORS', title: 'Item 1A. Risk Factors', content: 'Risk text.' },
        { sectionType: 'FINANCIAL_STATEMENTS', title: 'Item 8. Financial Statements', content: 'A giant table of numbers.' },
      ],
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Risk text.');
    expect(userPrompt).not.toContain('A giant table of numbers.');
  });

  it('includes the computed financial context block when provided', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validAnalysisResponse());

    await analyzeFiling({
      companyName: 'Acme Corp',
      formType: '10-K',
      filingDate: '2024-11-01',
      sections: [{ sectionType: 'BUSINESS', title: 'Item 1. Business', content: 'We make things.' }],
      financialContext: 'Revenue: $1.1B (+10% YoY)',
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Revenue: $1.1B (+10% YoY)');
  });

  it('returns the validated payload and token usage', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validAnalysisResponse());

    const result = await analyzeFiling({
      companyName: 'Acme Corp',
      formType: '10-K',
      filingDate: '2024-11-01',
      sections: [{ sectionType: 'BUSINESS', title: 'Item 1. Business', content: 'We make things.' }],
    });

    expect(result.payload.summary).toBe('The company reported solid results.');
    expect(result.inputTokens).toBe(500);
  });

  it('propagates AiNotConfiguredError untouched when no API key is set', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockRejectedValue(new anthropicClient.AiNotConfiguredError());

    await expect(
      analyzeFiling({
        companyName: 'Acme Corp',
        formType: '10-K',
        filingDate: '2024-11-01',
        sections: [{ sectionType: 'BUSINESS', title: 'Item 1. Business', content: 'We make things.' }],
      }),
    ).rejects.toBeInstanceOf(anthropicClient.AiNotConfiguredError);
  });
});
