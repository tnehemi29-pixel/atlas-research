import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Spec section 21 — the ONLY two AI-narrated sections of the 16-section
 * Investment Memo (Executive Summary and Conclusion). Every other section
 * is assembled deterministically by lib/services/investmentMemoService.ts
 * straight from the case's own frozen version snapshot — see that file's
 * header comment. Both narrative sections carry the same citation
 * discipline as the AI Thesis Assistant (lib/ai/investmentThesisSchema.ts):
 * cited ids are verified against the real case data after generation, never
 * trusted from the model's own claim.
 */

const narrativeSectionSchema = z.object({
  text: z.string().min(1),
  cited_evidence_ids: z.array(z.string()),
  cited_research_event_ids: z.array(z.string()),
});

export const investmentMemoNarrativeSchema = z.object({
  executive_summary: narrativeSectionSchema,
  conclusion: narrativeSectionSchema,
});
export type InvestmentMemoNarrativePayload = z.infer<typeof investmentMemoNarrativeSchema>;

const narrativeSectionToolSchema = {
  type: 'object' as const,
  properties: {
    text: { type: 'string', description: 'Narrative prose only. Every number or fact referenced must already appear in the context below — never calculate, estimate, or invent a figure.' },
    cited_evidence_ids: { type: 'array', items: { type: 'string' }, description: 'The exact evidence "id" values (from the context\'s Evidence section) that support this text. Only ids that literally appear in the context.' },
    cited_research_event_ids: { type: 'array', items: { type: 'string' }, description: 'The exact research-event "id" values (from the context\'s Recent Research Events section) that support this text. Only ids that literally appear in the context.' },
  },
  required: ['text', 'cited_evidence_ids', 'cited_research_event_ids'],
};

export const INVESTMENT_MEMO_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    executive_summary: { ...narrativeSectionToolSchema, description: 'A concise executive summary of the investment case: the thesis, the current valuation picture, and the most important supporting/contradicting evidence.' },
    conclusion: { ...narrativeSectionToolSchema, description: 'A closing synthesis: what would need to be true for the thesis to play out, and what the biggest open questions are. Never a buy/sell recommendation or a claim that the thesis is confirmed or broken.' },
  },
  required: ['executive_summary', 'conclusion'],
};
