import { describe, expect, it } from 'vitest';
import { RESEARCH_REPORT_TOOL_SCHEMA, researchReportAiSchema, type ResearchReportAiPayload } from './reportSchema';

function validPayload(): ResearchReportAiPayload {
  return {
    executive_summary: { text: 'The company delivered steady growth with expanding margins.', source_ids: [1] },
    company_overview_narrative: { text: 'A diversified technology company.', source_ids: [1] },
    financial_analysis_narrative: { text: 'Revenue accelerated while margins expanded year over year.', source_ids: [1] },
    growth_analysis: {
      drivers: [{ category: 'new_products', description: 'New product launches drove incremental revenue.', source_ids: [4] }],
    },
    valuation_commentary: { text: 'DCF and comps outputs are broadly consistent.', source_ids: [2, 3] },
    dcf_commentary: { text: 'The Base case implies modest upside driven by WACC assumptions.', source_ids: [2] },
    comps_commentary: { text: 'The company trades near the peer median EV/EBITDA multiple.', source_ids: [3] },
    sec_analysis: { insights: [{ category: 'new_risk', description: 'A new supply-chain risk was disclosed.', source_ids: [4] }] },
    earnings_analysis: { insights: [{ category: 'guidance_change', description: 'Management raised full-year guidance.', source_ids: [5] }] },
    catalysts: [{ category: 'new_products', description: 'Potential catalyst: an upcoming product launch.', source_ids: [5] }],
    risks: [
      {
        category: 'competitive',
        risk: 'Intensifying competition in the core market.',
        why_it_matters: 'Could pressure pricing and market share.',
        evidence: 'Management noted increased competitive intensity on the call.',
        source_ids: [5],
      },
    ],
    management_capital_allocation: { text: 'Management emphasized continued buybacks and R&D investment.', source_ids: [4, 5] },
    scenario_commentary: { text: 'The Bull case assumes faster margin expansion than the Base case.', source_ids: [2] },
    conclusion: {
      what_is_working: 'Revenue growth and margin expansion.',
      what_is_deteriorating: 'Insufficient data to determine.',
      valuation_implication: 'Valuation is highly sensitive to the terminal growth assumption.',
      key_assumptions: 'The WACC and terminal growth rate drive most of the implied value.',
      what_could_change_thesis: 'A material deceleration in revenue growth.',
      source_ids: [2, 3],
    },
  };
}

describe('researchReportAiSchema', () => {
  it('accepts a fully valid payload', () => {
    expect(researchReportAiSchema.safeParse(validPayload()).success).toBe(true);
  });

  it('rejects an invalid risk category the model invented itself', () => {
    const payload = validPayload();
    payload.risks = [{ ...payload.risks[0]!, category: 'astrological' as never }];
    expect(researchReportAiSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an invalid growth-driver category', () => {
    const payload = validPayload();
    payload.growth_analysis.drivers = [{ ...payload.growth_analysis.drivers[0]!, category: 'magic' as never }];
    expect(researchReportAiSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a catalyst missing source_ids', () => {
    const payload = validPayload();
    payload.catalysts = [{ category: 'earnings', description: 'x' } as never];
    expect(researchReportAiSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a non-integer or non-positive source id', () => {
    const payload = validPayload();
    payload.executive_summary.source_ids = [0];
    expect(researchReportAiSchema.safeParse(payload).success).toBe(false);

    const payload2 = validPayload();
    payload2.executive_summary.source_ids = [1.5];
    expect(researchReportAiSchema.safeParse(payload2).success).toBe(false);
  });

  it('rejects a missing top-level field entirely rather than defaulting it', () => {
    const payload = validPayload();
    // @ts-expect-error - deliberately testing an invalid/incomplete payload
    delete payload.conclusion;
    expect(researchReportAiSchema.safeParse(payload).success).toBe(false);
  });

  it('accepts empty arrays for every list field — no catalysts/risks/drivers found is valid, not an error', () => {
    const payload = validPayload();
    payload.growth_analysis.drivers = [];
    payload.sec_analysis.insights = [];
    payload.earnings_analysis.insights = [];
    payload.catalysts = [];
    payload.risks = [];
    expect(researchReportAiSchema.safeParse(payload).success).toBe(true);
  });

  it('accepts an empty source_ids array — a general narrative statement need not cite every source', () => {
    const payload = validPayload();
    payload.executive_summary.source_ids = [];
    expect(researchReportAiSchema.safeParse(payload).success).toBe(true);
  });
});

describe('tool schema / zod schema consistency', () => {
  it('RESEARCH_REPORT_TOOL_SCHEMA.required matches every top-level key the zod schema expects', () => {
    const zodKeys = Object.keys(researchReportAiSchema.shape).sort();
    const jsonSchemaKeys = [...(RESEARCH_REPORT_TOOL_SCHEMA.required ?? [])].sort();
    expect(jsonSchemaKeys).toEqual(zodKeys);
  });
});
