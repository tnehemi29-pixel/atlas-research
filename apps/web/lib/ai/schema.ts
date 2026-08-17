import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * The structured-output contract for AI filing analysis — "do not allow
 * the LLM to return arbitrary free-form data." Two representations of the
 * same shape are kept here, deliberately, and must be changed together:
 *
 *   1. The zod schemas — the runtime validator every AI response is
 *      checked against before it's ever stored or shown to a user.
 *   2. The hand-written JSON Schema objects passed as the Anthropic tool's
 *      `input_schema` — forces the model to return exactly this shape.
 *
 * zod 3 (pinned here for the Anthropic SDK's peer dependency) has no
 * built-in JSON Schema export, so these are kept in sync by hand rather
 * than adding another conversion library for a schema this size — the
 * tests in schema.test.ts assert the JSON Schema's own shape stays
 * consistent with what the zod schema actually accepts.
 */

export const riskCategorySchema = z.enum([
  'financial',
  'operational',
  'regulatory',
  'legal',
  'competitive',
  'macroeconomic',
  'liquidity',
  'governance',
]);
export type RiskCategory = z.infer<typeof riskCategorySchema>;

// Every AI-generated claim carries a citation back to the filing section it
// was drawn from — "every AI-generated insight should contain a reference
// to the underlying filing section" and "do NOT allow the AI to generate
// unsupported claims."
export const citationSchema = z.object({
  section: z.string().min(1),
  excerpt: z.string().min(1).max(600),
});
export type Citation = z.infer<typeof citationSchema>;

const citedItemSchema = z.object({
  description: z.string().min(1),
  source: citationSchema,
});
export type CitedItem = z.infer<typeof citedItemSchema>;

const riskItemSchema = citedItemSchema.extend({
  category: riskCategorySchema,
});
export type RiskItem = z.infer<typeof riskItemSchema>;

export const filingAnalysisSchema = z.object({
  summary: z.string().min(1),
  key_changes: z.array(citedItemSchema),
  risks: z.array(riskItemSchema),
  management_commentary: z.array(citedItemSchema),
  capital_allocation: z.array(citedItemSchema),
  accounting_changes: z.array(citedItemSchema),
});
export type FilingAnalysisPayload = z.infer<typeof filingAnalysisSchema>;

const citationJsonSchema = {
  type: 'object',
  properties: {
    section: { type: 'string', description: 'The filing section this claim is drawn from, e.g. "Risk Factors".' },
    excerpt: { type: 'string', description: 'A short, verbatim supporting quote from that section (under ~600 characters).' },
  },
  required: ['section', 'excerpt'],
} as const;

const citedItemJsonSchema = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    source: citationJsonSchema,
  },
  required: ['description', 'source'],
} as const;

export const FILING_ANALYSIS_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'A concise executive summary of the filing\'s most important developments.' },
    key_changes: { type: 'array', items: citedItemJsonSchema, description: 'Meaningful changes from the company\'s prior filings.' },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          category: {
            type: 'string',
            enum: ['financial', 'operational', 'regulatory', 'legal', 'competitive', 'macroeconomic', 'liquidity', 'governance'],
          },
          source: citationJsonSchema,
        },
        required: ['description', 'category', 'source'],
      },
      description: 'Risks disclosed in the filing, categorized. Every risk must be traceable to the filing text — never invented.',
    },
    management_commentary: { type: 'array', items: citedItemJsonSchema, description: "Important management commentary from the MD&A." },
    capital_allocation: { type: 'array', items: citedItemJsonSchema, description: 'Cash position, debt, capex, buybacks, dividends, acquisitions, debt issuance/repayment.' },
    accounting_changes: { type: 'array', items: citedItemJsonSchema, description: 'Accounting policy/estimate changes, restatements, material weaknesses — only when supported by the filing.' },
  },
  required: ['summary', 'key_changes', 'risks', 'management_commentary', 'capital_allocation', 'accounting_changes'],
};

// ---------------------------------------------------------------------------
// Filing comparison — the AI-generated qualitative portion only. Financial
// changes are computed deterministically (lib/ai/compareFilings.ts), never
// left to the model to transcribe from text.
// ---------------------------------------------------------------------------

const comparisonNoteSchema = z.literal('Potentially notable language change');

export const removedRiskItemSchema = z.object({
  description: z.string().min(1),
  priorSource: citationSchema,
});

export const changedLanguageItemSchema = z.object({
  description: z.string().min(1),
  // A fixed literal, not free text — the model cannot claim a language
  // change IS economically significant, only flag it for a human to judge.
  note: comparisonNoteSchema,
  currentSource: citationSchema,
  priorSource: citationSchema,
});

export const filingComparisonAiSchema = z.object({
  new_risks: z.array(citedItemSchema),
  removed_risks: z.array(removedRiskItemSchema),
  changed_language: z.array(changedLanguageItemSchema),
  guidance_changes: z.array(citedItemSchema),
  management_commentary_changes: z.array(citedItemSchema),
});
export type FilingComparisonAiPayload = z.infer<typeof filingComparisonAiSchema>;

export const FILING_COMPARISON_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    new_risks: { type: 'array', items: citedItemJsonSchema, description: 'Risk categories/topics present in the current filing but not the prior one.' },
    removed_risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { description: { type: 'string' }, priorSource: citationJsonSchema },
        required: ['description', 'priorSource'],
      },
      description: 'Risks present in the prior filing but no longer present in the current one.',
    },
    changed_language: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          note: { type: 'string', enum: ['Potentially notable language change'] },
          currentSource: citationJsonSchema,
          priorSource: citationJsonSchema,
        },
        required: ['description', 'note', 'currentSource', 'priorSource'],
      },
      description: 'Wording changes worth a human\'s attention — label only, never assert business significance.',
    },
    guidance_changes: { type: 'array', items: citedItemJsonSchema, description: 'Changes to forward-looking guidance, if disclosed.' },
    management_commentary_changes: { type: 'array', items: citedItemJsonSchema, description: 'How MD&A commentary differs from the prior filing.' },
  },
  required: ['new_risks', 'removed_risks', 'changed_language', 'guidance_changes', 'management_commentary_changes'],
};
