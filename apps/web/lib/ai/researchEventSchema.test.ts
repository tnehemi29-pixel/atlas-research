import { describe, expect, it } from 'vitest';
import { RESEARCH_EVENT_TOOL_SCHEMA, researchEventAiSchema, type ResearchEventAiPayload } from './researchEventSchema';

function validPayload(): ResearchEventAiPayload {
  return {
    summary: 'Management lowered full-year revenue guidance from $11.0B to $10.2B.',
    why_it_matters: 'The revised guidance is below the revenue growth assumption used in the most recent research report.',
    affected_research_areas: ['FINANCIALS', 'DCF', 'GROWTH', 'INVESTMENT_THESIS'],
    questions_to_investigate: ['What specifically drove the guidance cut?', 'Does this affect the Q4 margin outlook?'],
    confidence: 'high',
  };
}

describe('researchEventAiSchema', () => {
  it('accepts a valid payload', () => {
    expect(researchEventAiSchema.safeParse(validPayload()).success).toBe(true);
  });

  it('rejects an invented research area', () => {
    const payload = validPayload();
    payload.affected_research_areas = ['MARKET_SENTIMENT' as never];
    expect(researchEventAiSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an invalid confidence value', () => {
    const payload = validPayload();
    payload.confidence = 'very high' as never;
    expect(researchEventAiSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a missing required field', () => {
    const payload = validPayload();
    // @ts-expect-error - deliberately testing an incomplete payload
    delete payload.why_it_matters;
    expect(researchEventAiSchema.safeParse(payload).success).toBe(false);
  });

  it('accepts an empty affected_research_areas / questions_to_investigate array', () => {
    const payload = validPayload();
    payload.affected_research_areas = [];
    payload.questions_to_investigate = [];
    expect(researchEventAiSchema.safeParse(payload).success).toBe(true);
  });
});

describe('tool schema / zod schema consistency', () => {
  it('RESEARCH_EVENT_TOOL_SCHEMA.required matches every top-level key the zod schema expects', () => {
    const zodKeys = Object.keys(researchEventAiSchema.shape).sort();
    const jsonSchemaKeys = [...(RESEARCH_EVENT_TOOL_SCHEMA.required ?? [])].sort();
    expect(jsonSchemaKeys).toEqual(zodKeys);
  });
});
