import { RESEARCH_EVENT_SYSTEM_PROMPT, buildResearchEventUserPrompt, type ResearchEventPromptInput } from './researchEventPrompts';
import { runStructuredAnalysis } from './runStructuredAnalysis';
import { RESEARCH_EVENT_TOOL_SCHEMA, researchEventAiSchema, type ResearchEventAiPayload } from './researchEventSchema';

const TOOL_NAME = 'submit_research_event_explanation';
const TOOL_DESCRIPTION = 'Submit the structured explanation of this research event.';

export interface ExplainResearchEventResult {
  payload: ResearchEventAiPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Explains an already-detected, already-materiality-classified research
 * event. Only ever called for events at/above the configured materiality
 * threshold (see lib/researchEvents/materialityConfig.ts's
 * shouldRunAiAnalysis) — this function itself has no cost-control logic,
 * that decision is made once, by the caller, before this is ever invoked.
 */
export async function explainResearchEvent(input: ResearchEventPromptInput): Promise<ExplainResearchEventResult> {
  const user = buildResearchEventUserPrompt(input);

  return runStructuredAnalysis<ResearchEventAiPayload>({
    system: RESEARCH_EVENT_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: RESEARCH_EVENT_TOOL_SCHEMA,
    zodSchema: researchEventAiSchema,
  });
}
