import { runStructuredAnalysis } from './runStructuredAnalysis';
import { WORKSPACE_ASSISTANT_TOOL_SCHEMA, workspaceAssistantAiSchema, type WorkspaceAssistantAiPayload } from './workspaceAssistantSchema';
import { WORKSPACE_ASSISTANT_SYSTEM_PROMPT, buildWorkspaceAssistantUserPrompt, type WorkspaceAssistantPromptInput } from './workspaceAssistantPrompts';

/**
 * Milestone 15 spec section 22 — the workspace AI assistant orchestrator,
 * mirroring lib/ai/investmentThesisAssistant.ts's structure exactly.
 * Authorization already happened before this is ever called
 * (lib/workspace/assistantContext.ts's buildWorkspaceAssistantContext
 * throws if the caller isn't a workspace member) — this file's own job is
 * strictly "ask the model, verify its citations," nothing more.
 */

const TOOL_NAME = 'submit_workspace_research_answer';
const TOOL_DESCRIPTION = "Submit the structured answer to the user's question about their research workspace.";

export interface AskWorkspaceAssistantResult {
  payload: WorkspaceAssistantAiPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Strips any cited id the model returns that isn't actually present in
 * `validIds` — a citation is backend-verified, never trusted from the
 * model's own claim alone (mirrors sanitizeThesisAssistantPayload). */
export function sanitizeWorkspaceAssistantPayload(payload: WorkspaceAssistantAiPayload, validIds: Set<string>): WorkspaceAssistantAiPayload {
  return { ...payload, cited_source_ids: payload.cited_source_ids.filter((id) => validIds.has(id)) };
}

/** `validIds` should be `collectValidWorkspaceContextIds(context)`, computed
 * from the exact same context object passed in `input.context`. */
export async function answerWorkspaceQuestion(input: WorkspaceAssistantPromptInput, validIds: Set<string>): Promise<AskWorkspaceAssistantResult> {
  const user = buildWorkspaceAssistantUserPrompt(input);

  const result = await runStructuredAnalysis<WorkspaceAssistantAiPayload>({
    system: WORKSPACE_ASSISTANT_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: WORKSPACE_ASSISTANT_TOOL_SCHEMA,
    zodSchema: workspaceAssistantAiSchema,
  });

  return { ...result, payload: sanitizeWorkspaceAssistantPayload(result.payload, validIds) };
}
