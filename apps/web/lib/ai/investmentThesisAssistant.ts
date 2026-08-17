import { runStructuredAnalysis } from './runStructuredAnalysis';
import { INVESTMENT_THESIS_TOOL_SCHEMA, investmentThesisAiSchema, type InvestmentThesisAiPayload } from './investmentThesisSchema';
import { INVESTMENT_THESIS_SYSTEM_PROMPT, buildInvestmentThesisUserPrompt, type InvestmentThesisPromptInput } from './investmentThesisPrompts';

const TOOL_NAME = 'submit_investment_thesis_answer';
const TOOL_DESCRIPTION = 'Submit the structured answer to the investment-case question.';

export interface AskInvestmentThesisResult {
  payload: InvestmentThesisAiPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Strips any cited id the model returns that isn't actually present in
 * `validIds` — mirrors lib/ai/generateResearchReport.ts's
 * `sanitizeReportPayload`. A citation is backend-verified before it's ever
 * shown to a user, never trusted from the model's own claim alone. */
export function sanitizeThesisAssistantPayload(payload: InvestmentThesisAiPayload, validIds: Set<string>): InvestmentThesisAiPayload {
  return {
    ...payload,
    cited_evidence_ids: payload.cited_evidence_ids.filter((id) => validIds.has(id)),
    cited_research_event_ids: payload.cited_research_event_ids.filter((id) => validIds.has(id)),
  };
}

/** `validIds` should be `collectValidCitationIds(context)` from
 * lib/investmentCase/context.ts, computed from the exact same context
 * object passed in `input.context`. */
export async function askInvestmentThesisAssistant(input: InvestmentThesisPromptInput, validIds: Set<string>): Promise<AskInvestmentThesisResult> {
  const user = buildInvestmentThesisUserPrompt(input);

  const result = await runStructuredAnalysis<InvestmentThesisAiPayload>({
    system: INVESTMENT_THESIS_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: INVESTMENT_THESIS_TOOL_SCHEMA,
    zodSchema: investmentThesisAiSchema,
  });

  return { ...result, payload: sanitizeThesisAssistantPayload(result.payload, validIds) };
}
