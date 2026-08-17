import { runStructuredAnalysis } from './runStructuredAnalysis';
import { INVESTMENT_MEMO_TOOL_SCHEMA, investmentMemoNarrativeSchema, type InvestmentMemoNarrativePayload } from './investmentMemoSchema';
import { INVESTMENT_MEMO_SYSTEM_PROMPT, buildInvestmentMemoUserPrompt, type InvestmentMemoPromptInput } from './investmentMemoPrompts';

const TOOL_NAME = 'submit_investment_memo_narrative';
const TOOL_DESCRIPTION = 'Submit the executive summary and conclusion sections of the investment memo.';

export interface GenerateInvestmentMemoNarrativeResult {
  payload: InvestmentMemoNarrativePayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function sanitizeSection(section: { text: string; cited_evidence_ids: string[]; cited_research_event_ids: string[] }, validIds: Set<string>) {
  return {
    text: section.text,
    cited_evidence_ids: section.cited_evidence_ids.filter((id) => validIds.has(id)),
    cited_research_event_ids: section.cited_research_event_ids.filter((id) => validIds.has(id)),
  };
}

/** Strips any cited id not present in `validIds` from both narrative
 * sections — the same backend-enforced discipline as
 * lib/ai/investmentThesisAssistant.ts's `sanitizeThesisAssistantPayload`. */
export function sanitizeMemoNarrativePayload(payload: InvestmentMemoNarrativePayload, validIds: Set<string>): InvestmentMemoNarrativePayload {
  return {
    executive_summary: sanitizeSection(payload.executive_summary, validIds),
    conclusion: sanitizeSection(payload.conclusion, validIds),
  };
}

/** `validIds` should be `collectValidCitationIds(context)` from
 * lib/investmentCase/context.ts, computed from the exact same context
 * object passed in `input.context`. */
export async function generateInvestmentMemoNarrative(input: InvestmentMemoPromptInput, validIds: Set<string>): Promise<GenerateInvestmentMemoNarrativeResult> {
  const user = buildInvestmentMemoUserPrompt(input);

  const result = await runStructuredAnalysis<InvestmentMemoNarrativePayload>({
    system: INVESTMENT_MEMO_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: INVESTMENT_MEMO_TOOL_SCHEMA,
    zodSchema: investmentMemoNarrativeSchema,
  });

  return { ...result, payload: sanitizeMemoNarrativePayload(result.payload, validIds) };
}
