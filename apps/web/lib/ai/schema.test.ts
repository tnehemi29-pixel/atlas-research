import { describe, expect, it } from 'vitest';
import {
  FILING_ANALYSIS_TOOL_SCHEMA,
  FILING_COMPARISON_TOOL_SCHEMA,
  filingAnalysisSchema,
  filingComparisonAiSchema,
} from './schema';

function validAnalysisPayload() {
  return {
    summary: 'The company reported strong revenue growth and expanded margins.',
    key_changes: [
      { description: 'Revenue growth accelerated to 12% from 8%.', source: { section: 'MDA', excerpt: 'Revenue grew 12%.' } },
    ],
    risks: [
      {
        description: 'Supply chain concentration risk in a single region.',
        category: 'operational',
        source: { section: 'RISK_FACTORS', excerpt: 'We rely on a limited number of suppliers.' },
      },
    ],
    management_commentary: [
      { description: 'Management highlighted continued investment in R&D.', source: { section: 'MDA', excerpt: 'We continue to invest.' } },
    ],
    capital_allocation: [
      { description: 'The company repurchased $500M of shares.', source: { section: 'LIQUIDITY', excerpt: 'Repurchased $500M.' } },
    ],
    accounting_changes: [],
  };
}

describe('filingAnalysisSchema', () => {
  it('accepts a fully valid payload', () => {
    const result = filingAnalysisSchema.safeParse(validAnalysisPayload());
    expect(result.success).toBe(true);
  });

  it('rejects a risk item missing its citation source — every claim must be traceable', () => {
    const payload = validAnalysisPayload();
    payload.risks = [{ description: 'A risk with no source.', category: 'financial' } as never];
    const result = filingAnalysisSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid risk category — the model cannot invent its own category', () => {
    const payload = validAnalysisPayload();
    payload.risks = [
      { description: 'Some risk.', category: 'astrological' as never, source: { section: 'RISK_FACTORS', excerpt: 'x' } },
    ];
    const result = filingAnalysisSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects a missing top-level field entirely rather than defaulting it', () => {
    const payload = validAnalysisPayload();
    // @ts-expect-error - deliberately testing an invalid/incomplete payload
    delete payload.summary;
    const result = filingAnalysisSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('accepts empty arrays for every list field — a filing with no notable accounting changes is valid, not an error', () => {
    const payload = { ...validAnalysisPayload(), key_changes: [], risks: [], management_commentary: [], capital_allocation: [], accounting_changes: [] };
    expect(filingAnalysisSchema.safeParse(payload).success).toBe(true);
  });
});

describe('filingComparisonAiSchema', () => {
  it('accepts a valid comparison payload', () => {
    const payload = {
      new_risks: [{ description: 'A new cybersecurity risk was added.', source: { section: 'RISK_FACTORS', excerpt: 'New risk text.' } }],
      removed_risks: [{ description: 'The pandemic-related risk factor was removed.', priorSource: { section: 'RISK_FACTORS', excerpt: 'Prior risk text.' } }],
      changed_language: [
        {
          description: 'The competition risk language was expanded.',
          note: 'Potentially notable language change',
          currentSource: { section: 'RISK_FACTORS', excerpt: 'Current text.' },
          priorSource: { section: 'RISK_FACTORS', excerpt: 'Prior text.' },
        },
      ],
      guidance_changes: [],
      management_commentary_changes: [],
    };
    expect(filingComparisonAiSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects a changed_language item whose note is not the exact required literal — the model cannot assert importance itself', () => {
    const payload = {
      new_risks: [],
      removed_risks: [],
      changed_language: [
        {
          description: 'x',
          note: 'This is a major business risk', // not the fixed literal
          currentSource: { section: 'RISK_FACTORS', excerpt: 'x' },
          priorSource: { section: 'RISK_FACTORS', excerpt: 'x' },
        },
      ],
      guidance_changes: [],
      management_commentary_changes: [],
    };
    const result = filingComparisonAiSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('tool schema / zod schema consistency', () => {
  it('FILING_ANALYSIS_TOOL_SCHEMA.required matches every top-level key the zod schema expects', () => {
    const zodKeys = Object.keys(filingAnalysisSchema.shape).sort();
    const jsonSchemaKeys = [...(FILING_ANALYSIS_TOOL_SCHEMA.required ?? [])].sort();
    expect(jsonSchemaKeys).toEqual(zodKeys);
  });

  it('FILING_COMPARISON_TOOL_SCHEMA.required matches every top-level key the zod schema expects', () => {
    const zodKeys = Object.keys(filingComparisonAiSchema.shape).sort();
    const jsonSchemaKeys = [...(FILING_COMPARISON_TOOL_SCHEMA.required ?? [])].sort();
    expect(jsonSchemaKeys).toEqual(zodKeys);
  });
});
