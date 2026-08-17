import type { ResearchContext, ResearchSource } from '@/lib/research/types';
import { buildResearchReportUserPrompt, RESEARCH_REPORT_SYSTEM_PROMPT } from './reportPrompts';
import { RESEARCH_REPORT_TOOL_SCHEMA, researchReportAiSchema, type ResearchReportAiPayload } from './reportSchema';
import { runStructuredAnalysis } from './runStructuredAnalysis';

const TOOL_NAME = 'submit_research_report';
const TOOL_DESCRIPTION = 'Submit the structured equity research report.';

export interface GenerateResearchReportResult {
  payload: ResearchReportAiPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * The model's own output is validated against researchReportAiSchema by
 * runStructuredAnalysis, but schema validity doesn't guarantee the model
 * didn't cite a source_id outside the range it was actually shown (e.g. it
 * hallucinates ID 9 when only 5 sources exist, or transposes digits). This
 * is the second, independent safeguard promised by the milestone spec:
 * "The backend should inject valid source IDs into the report" — any ID
 * that doesn't resolve to a real ResearchSource is silently dropped, never
 * trusted. A claim that loses all its citations this way still renders; it
 * just renders uncited, which is honest.
 */
function sanitizeSourceIds(ids: number[], validIds: ReadonlySet<number>): number[] {
  return ids.filter((id) => validIds.has(id));
}

export function sanitizeReportPayload(payload: ResearchReportAiPayload, sources: ResearchSource[]): ResearchReportAiPayload {
  const validIds = new Set(sources.map((s) => s.id));
  const clean = (ids: number[]) => sanitizeSourceIds(ids, validIds);

  return {
    executive_summary: { ...payload.executive_summary, source_ids: clean(payload.executive_summary.source_ids) },
    company_overview_narrative: { ...payload.company_overview_narrative, source_ids: clean(payload.company_overview_narrative.source_ids) },
    financial_analysis_narrative: { ...payload.financial_analysis_narrative, source_ids: clean(payload.financial_analysis_narrative.source_ids) },
    growth_analysis: {
      drivers: payload.growth_analysis.drivers.map((d) => ({ ...d, source_ids: clean(d.source_ids) })),
    },
    valuation_commentary: { ...payload.valuation_commentary, source_ids: clean(payload.valuation_commentary.source_ids) },
    dcf_commentary: { ...payload.dcf_commentary, source_ids: clean(payload.dcf_commentary.source_ids) },
    comps_commentary: { ...payload.comps_commentary, source_ids: clean(payload.comps_commentary.source_ids) },
    sec_analysis: {
      insights: payload.sec_analysis.insights.map((i) => ({ ...i, source_ids: clean(i.source_ids) })),
    },
    earnings_analysis: {
      insights: payload.earnings_analysis.insights.map((i) => ({ ...i, source_ids: clean(i.source_ids) })),
    },
    catalysts: payload.catalysts.map((c) => ({ ...c, source_ids: clean(c.source_ids) })),
    risks: payload.risks.map((r) => ({ ...r, source_ids: clean(r.source_ids) })),
    management_capital_allocation: { ...payload.management_capital_allocation, source_ids: clean(payload.management_capital_allocation.source_ids) },
    scenario_commentary: { ...payload.scenario_commentary, source_ids: clean(payload.scenario_commentary.source_ids) },
    conclusion: { ...payload.conclusion, source_ids: clean(payload.conclusion.source_ids) },
  };
}

/**
 * Generates the narrative half of a research report from an already-built
 * ResearchContext. Never fetches data itself — lib/services/researchReportService.ts
 * owns calling lib/research/aggregateResearchContext.ts first. Every number
 * in the final report comes from `context`, not from this function's output.
 */
export async function generateResearchReport(context: ResearchContext): Promise<GenerateResearchReportResult> {
  const user = buildResearchReportUserPrompt(context);

  const result = await runStructuredAnalysis<ResearchReportAiPayload>({
    system: RESEARCH_REPORT_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: RESEARCH_REPORT_TOOL_SCHEMA,
    zodSchema: researchReportAiSchema,
  });

  return {
    ...result,
    payload: sanitizeReportPayload(result.payload, context.sources),
  };
}
