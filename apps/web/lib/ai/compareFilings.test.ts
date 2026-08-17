import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareFilings } from './compareFilings';
import * as anthropicClient from './anthropicClient';

function validComparisonResponse() {
  return {
    data: {
      new_risks: [],
      removed_risks: [],
      changed_language: [],
      guidance_changes: [],
      management_commentary_changes: [],
    },
    model: 'claude-sonnet-4-5',
    inputTokens: 800,
    outputTokens: 300,
  };
}

describe('compareFilings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends only comparison-relevant sections (Risk Factors, MD&A, Liquidity) from both filings', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validComparisonResponse());

    await compareFilings({
      companyName: 'Acme Corp',
      currentFormType: '10-K',
      currentFilingDate: '2025-11-01',
      priorFormType: '10-K',
      priorFilingDate: '2024-11-01',
      currentSections: [
        { sectionType: 'RISK_FACTORS', title: 'Item 1A. Risk Factors', content: 'Current risk text.' },
        { sectionType: 'BUSINESS', title: 'Item 1. Business', content: 'Business description not needed for comparison.' },
      ],
      priorSections: [{ sectionType: 'RISK_FACTORS', title: 'Item 1A. Risk Factors', content: 'Prior risk text.' }],
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Current risk text.');
    expect(userPrompt).toContain('Prior risk text.');
    expect(userPrompt).not.toContain('Business description not needed');
  });

  it('labels the current vs. prior filings clearly in the prompt', async () => {
    const spy = vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validComparisonResponse());

    await compareFilings({
      companyName: 'Acme Corp',
      currentFormType: '10-Q',
      currentFilingDate: '2026-05-01',
      priorFormType: '10-Q',
      priorFilingDate: '2026-02-01',
      currentSections: [{ sectionType: 'MDA', title: 'Item 2. MD&A', content: 'Q2 commentary.' }],
      priorSections: [{ sectionType: 'MDA', title: 'Item 2. MD&A', content: 'Q1 commentary.' }],
    });

    const userPrompt = spy.mock.calls[0]?.[0].user ?? '';
    expect(userPrompt).toContain('Current filing: 10-Q filed 2026-05-01');
    expect(userPrompt).toContain('Prior filing: 10-Q filed 2026-02-01');
  });

  it('returns the validated comparison payload', async () => {
    vi.spyOn(anthropicClient, 'requestStructuredCompletion').mockResolvedValue(validComparisonResponse());

    const result = await compareFilings({
      companyName: 'Acme Corp',
      currentFormType: '10-K',
      currentFilingDate: '2025-11-01',
      priorFormType: '10-K',
      priorFilingDate: '2024-11-01',
      currentSections: [{ sectionType: 'RISK_FACTORS', title: 'Item 1A. Risk Factors', content: 'x' }],
      priorSections: [{ sectionType: 'RISK_FACTORS', title: 'Item 1A. Risk Factors', content: 'y' }],
    });

    expect(result.payload).toEqual({
      new_risks: [],
      removed_risks: [],
      changed_language: [],
      guidance_changes: [],
      management_commentary_changes: [],
    });
  });
});
