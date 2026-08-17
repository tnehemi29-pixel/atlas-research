import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Milestone 15 spec section 22 — the workspace AI assistant's structured-
 * output contract, mirroring lib/ai/investmentThesisSchema.ts's own
 * discipline exactly: no field for an invented fact or source.
 * `cited_source_ids` must reference ids that literally appear in the
 * context (lib/workspace/assistantContext.ts) — enforced twice, once by
 * instruction and once mechanically after the fact
 * (lib/ai/answerWorkspaceQuestion.ts).
 */

export const workspaceAssistantAiSchema = z.object({
  answer: z.string().min(1),
  cited_source_ids: z.array(z.string()),
  caveats: z.array(z.string()),
});
export type WorkspaceAssistantAiPayload = z.infer<typeof workspaceAssistantAiSchema>;

export const WORKSPACE_ASSISTANT_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    answer: {
      type: 'string',
      description: "The answer to the user's question, grounded only in the provided workspace context. Never invent a company, task, issue, or figure not present in the context. Never a buy/sell recommendation, never a ranking of analysts.",
    },
    cited_source_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'The exact "id" values (e.g. "task:...", "issue:...", "case:...") from the context that support this answer. Only ids that literally appear in the context — never invent one.',
    },
    caveats: {
      type: 'array',
      items: { type: 'string' },
      description: 'Anything relevant that could not be determined from the given context, or an important limitation of the answer (e.g. "no data available for that ticker in this workspace").',
    },
  },
  required: ['answer', 'cited_source_ids', 'caveats'],
};
