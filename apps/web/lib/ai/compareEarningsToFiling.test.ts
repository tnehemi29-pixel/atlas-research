import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareEarningsToFiling } from './compareEarningsToFiling';
import * as anthropicClient from './anthropicClient';

function validResponse() {
  return {
    data: { alignments: [], new_in_call: [], only_in_filing: [], risk_emphasis_differences: [], guidance_differences: [] },
    model: 'claude-sonnet-4-5',
    inputTokens: 1200,
    outputTokens: 400,
  };
}

describe('compareEarningsToFiling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes both the call transcript and the filing sections in the prompt', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse());

    await compareEarningsToFiling({
      companyName: 'Acme Corp',
      fiscalYear: 2025,
      fiscalQuarter: 3,
      callSegments: [
        { section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'We discussed AI infrastructure investment.', anchor: 'segment-1' },
      ],
      filingFormType: '10-Q',
      filingSections: [{ sectionType: 'RISK_FACTORS', title: 'Item 1A. Risk Factors', content: 'We depend on a limited number of suppliers.' }],
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('We discussed AI infrastructure investment.');
    expect(userPrompt).toContain('We depend on a limited number of suppliers.');
    expect(userPrompt).toContain('SEC filing: 10-Q');
  });

  it('excludes filing sections not relevant to comparison (e.g. Business)', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse());

    await compareEarningsToFiling({
      companyName: 'Acme Corp',
      fiscalYear: 2025,
      fiscalQuarter: 3,
      callSegments: [{ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'x', anchor: 'segment-1' }],
      filingFormType: '10-Q',
      filingSections: [
        { sectionType: 'BUSINESS', title: 'Item 1. Business', content: 'Business description not needed for comparison.' },
        { sectionType: 'RISK_FACTORS', title: 'Item 1A. Risk Factors', content: 'Risk text.' },
      ],
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).not.toContain('Business description not needed');
    expect(userPrompt).toContain('Risk text.');
  });

  it('returns the validated comparison payload', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validResponse());

    const result = await compareEarningsToFiling({
      companyName: 'Acme Corp',
      fiscalYear: 2025,
      fiscalQuarter: 3,
      callSegments: [{ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'x', anchor: 'segment-1' }],
      filingFormType: '10-Q',
      filingSections: [{ sectionType: 'RISK_FACTORS', title: 'Item 1A. Risk Factors', content: 'y' }],
    });

    expect(result.payload).toEqual({
      alignments: [],
      new_in_call: [],
      only_in_filing: [],
      risk_emphasis_differences: [],
      guidance_differences: [],
    });
  });
});
