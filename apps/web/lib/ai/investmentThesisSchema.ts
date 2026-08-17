import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Spec section 9 — the AI Thesis Assistant's structured-output contract.
 * There is no field anywhere here for a number, a fact, or a source the
 * model invents itself: `cited_evidence_ids`/`cited_research_event_ids` are
 * meant to reference REAL ids already present in the prompt's own context —
 * enforced twice, once by instruction (lib/ai/investmentThesisPrompts.ts)
 * and once mechanically, after the fact, by
 * lib/ai/investmentThesisAssistant.ts stripping any id that isn't actually
 * in the context (the same "backend-enforced, never just prompt-enforced"
 * discipline as Milestone 9's `sanitizeReportPayload`).
 */

export const investmentThesisAiSchema = z.object({
  answer: z.string().min(1),
  cited_evidence_ids: z.array(z.string()),
  cited_research_event_ids: z.array(z.string()),
  /** Anything the model could not answer from the given context, or a
   * limitation the user should be aware of (e.g. "no live data available
   * for this metric") — never silently omitted. */
  caveats: z.array(z.string()),
});
export type InvestmentThesisAiPayload = z.infer<typeof investmentThesisAiSchema>;

export const INVESTMENT_THESIS_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    answer: {
      type: 'string',
      description: 'The answer to the user\'s question, grounded only in the provided case context. Never invent a fact, figure, or source. Never a buy/sell recommendation or personalized financial advice.',
    },
    cited_evidence_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'The exact evidence "id" values (from the context\'s Evidence section) that support this answer. Only ids that literally appear in the context — never invent one.',
    },
    cited_research_event_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'The exact research-event "id" values (from the context\'s Recent Research Events section) that support this answer. Only ids that literally appear in the context — never invent one.',
    },
    caveats: {
      type: 'array',
      items: { type: 'string' },
      description: 'Anything relevant that could not be determined from the given context, or an important limitation of the answer.',
    },
  },
  required: ['answer', 'cited_evidence_ids', 'cited_research_event_ids', 'caveats'],
};
