import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * The structured-output contract for a research event's AI explanation —
 * same "no arbitrary free-form data" discipline as lib/ai/schema.ts (M7),
 * lib/ai/earningsSchema.ts (M8), and lib/ai/reportSchema.ts (M9). Narrative
 * only: there is no field anywhere here for a number — every figure in a
 * ResearchEvent lives in its `changes` relation, computed deterministically
 * by lib/researchEvents/changeDetection.ts *before* this schema is ever
 * populated. `affected_research_areas` is constrained to the same
 * ResearchArea enum lib/researchEvents/impactMapping.ts's deterministic
 * rules already use — the model can select from that closed list, never
 * invent a new one.
 */

export const researchEventAreaSchema = z.enum([
  'FINANCIALS',
  'GROWTH',
  'MARGINS',
  'DCF',
  'COMPS',
  'RISKS',
  'CATALYSTS',
  'MANAGEMENT',
  'CAPITAL_ALLOCATION',
  'INVESTMENT_THESIS',
]);

export const researchEventConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const researchEventAiSchema = z.object({
  summary: z.string().min(1),
  why_it_matters: z.string().min(1),
  affected_research_areas: z.array(researchEventAreaSchema),
  questions_to_investigate: z.array(z.string().min(1)),
  confidence: researchEventConfidenceSchema,
});
export type ResearchEventAiPayload = z.infer<typeof researchEventAiSchema>;

export const RESEARCH_EVENT_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'A concise, neutral summary of what changed. Grounded only in the provided event data — never invent a fact not given.',
    },
    why_it_matters: {
      type: 'string',
      description:
        'Why this change is relevant to a research analyst. Never a buy/sell recommendation, never a claim that a model or thesis has definitively changed.',
    },
    affected_research_areas: {
      type: 'array',
      items: { type: 'string', enum: researchEventAreaSchema.options },
      description: 'Which of the given research areas this event potentially touches. Only select from the provided list — never invent a new area.',
    },
    questions_to_investigate: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific, concrete questions a research analyst should look into next as a result of this event.',
    },
    confidence: {
      type: 'string',
      enum: researchEventConfidenceSchema.options,
      description:
        'Your confidence in this explanation given the provided data — reflects how directly the source data supports the explanation, never a prediction about future outcomes.',
    },
  },
  required: ['summary', 'why_it_matters', 'affected_research_areas', 'questions_to_investigate', 'confidence'],
};
