import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareEarningsCalls } from './compareEarningsCalls';
import * as anthropicClient from './anthropicClient';

function validComparisonResponse() {
  return {
    data: { language_changes: [], tone_comparison: [] },
    model: 'claude-sonnet-4-5',
    inputTokens: 800,
    outputTokens: 300,
  };
}

describe('compareEarningsCalls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends prepared-remarks/QA segments from both calls, excluding opening remarks', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validComparisonResponse());

    await compareEarningsCalls({
      companyName: 'Acme Corp',
      currentFiscalYear: 2025,
      currentFiscalQuarter: 3,
      priorFiscalYear: 2025,
      priorFiscalQuarter: 2,
      currentSegments: [
        { section: 'OPENING_REMARKS', speakerName: 'Operator', speakerRole: null, speakerType: 'OPERATOR', text: 'Welcome to the call.', anchor: 'segment-0' },
        { section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'Current quarter commentary.', anchor: 'segment-1' },
      ],
      priorSegments: [
        { section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'Prior quarter commentary.', anchor: 'segment-1' },
      ],
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Current quarter commentary.');
    expect(userPrompt).toContain('Prior quarter commentary.');
    expect(userPrompt).not.toContain('Welcome to the call.');
  });

  it('labels the current vs. prior calls clearly in the prompt', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validComparisonResponse());

    await compareEarningsCalls({
      companyName: 'Acme Corp',
      currentFiscalYear: 2025,
      currentFiscalQuarter: 3,
      priorFiscalYear: 2025,
      priorFiscalQuarter: 2,
      currentSegments: [{ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'Q3 commentary.', anchor: 'segment-1' }],
      priorSegments: [{ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'Q2 commentary.', anchor: 'segment-1' }],
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Current call: Q3 2025');
    expect(userPrompt).toContain('Prior call: Q2 2025');
  });

  it('returns the validated comparison payload', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validComparisonResponse());

    const result = await compareEarningsCalls({
      companyName: 'Acme Corp',
      currentFiscalYear: 2025,
      currentFiscalQuarter: 3,
      priorFiscalYear: 2025,
      priorFiscalQuarter: 2,
      currentSegments: [{ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'x', anchor: 'segment-1' }],
      priorSegments: [{ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', speakerRole: null, speakerType: 'EXECUTIVE', text: 'y', anchor: 'segment-1' }],
    });

    expect(result.payload).toEqual({ language_changes: [], tone_comparison: [] });
  });
});
