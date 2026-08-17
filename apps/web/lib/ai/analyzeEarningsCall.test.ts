import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeEarningsCall } from './analyzeEarningsCall';
import * as anthropicClient from './anthropicClient';

function validAnalysisResponse() {
  return {
    data: {
      summary: 'Strong quarter with accelerating demand.',
      business_trends: [],
      management_commentary: [],
      guidance_observations: [],
      risks: [],
      capital_allocation: [],
      analyst_topics: [],
      management_language: [],
    },
    model: 'claude-sonnet-4-5',
    inputTokens: 800,
    outputTokens: 300,
  };
}

describe('analyzeEarningsCall', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends only prepared-remarks and Q&A segments, excluding opening remarks', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validAnalysisResponse());

    await analyzeEarningsCall({
      companyName: 'Acme Corp',
      fiscalYear: 2025,
      fiscalQuarter: 3,
      callDate: '2025-08-01',
      segments: [
        { section: 'OPENING_REMARKS', speakerName: 'Operator', speakerRole: null, speakerType: 'OPERATOR', text: 'Welcome everyone.', anchor: 'segment-0' },
        { section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: 'CEO', speakerType: 'EXECUTIVE', text: 'We had a strong quarter.', anchor: 'segment-1' },
      ],
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('We had a strong quarter.');
    expect(userPrompt).not.toContain('Welcome everyone.');
  });

  it('formats the speaker label with role for citation', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validAnalysisResponse());

    await analyzeEarningsCall({
      companyName: 'Acme Corp',
      fiscalYear: 2025,
      fiscalQuarter: 3,
      callDate: null,
      segments: [
        { section: 'QA', speakerName: 'Sam Patel', speakerRole: 'Meridian Securities', speakerType: 'ANALYST', text: 'How is demand?', anchor: 'segment-5' },
      ],
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Sam Patel (Meridian Securities): How is demand?');
  });

  it('includes the computed financial context block when provided', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validAnalysisResponse());

    await analyzeEarningsCall({
      companyName: 'Acme Corp',
      fiscalYear: 2025,
      fiscalQuarter: 3,
      callDate: null,
      segments: [{ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'Revenue grew.', anchor: 'segment-1' }],
      financialContext: 'Revenue: $4.2B (+14% YoY)',
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Revenue: $4.2B (+14% YoY)');
  });

  it('returns the validated payload and token usage', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validAnalysisResponse());

    const result = await analyzeEarningsCall({
      companyName: 'Acme Corp',
      fiscalYear: 2025,
      fiscalQuarter: 3,
      callDate: null,
      segments: [{ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'Revenue grew.', anchor: 'segment-1' }],
    });

    expect(result.payload.summary).toBe('Strong quarter with accelerating demand.');
    expect(result.inputTokens).toBe(800);
  });

  it('propagates AiNotConfiguredError untouched when no API key is set', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockRejectedValue(new anthropicClient.AiNotConfiguredError());

    await expect(
      analyzeEarningsCall({
        companyName: 'Acme Corp',
        fiscalYear: 2025,
        fiscalQuarter: 3,
        callDate: null,
        segments: [{ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'x', anchor: 'segment-1' }],
      }),
    ).rejects.toBeInstanceOf(anthropicClient.AiNotConfiguredError);
  });
});
