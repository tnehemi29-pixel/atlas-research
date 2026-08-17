import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * The structured-output contract for AI earnings-call analysis — same
 * "do not allow the LLM to return arbitrary free-form data" discipline as
 * lib/ai/schema.ts (Milestone 7): a zod schema validates every response
 * before it's stored, and a hand-written JSON Schema forces the shape via
 * Anthropic's tool-use. Kept in sync by hand and cross-checked in
 * earningsSchema.test.ts, same as filing analysis.
 *
 * Every array item carries a `source` citation — {speaker, excerpt} instead
 * of filing's {section, excerpt}, since a transcript's useful unit of
 * traceability is "who said it," not a coarse document section.
 */

export const earningsCitationSchema = z.object({
  speaker: z.string().min(1),
  excerpt: z.string().min(1).max(600),
});
export type EarningsCitation = z.infer<typeof earningsCitationSchema>;

const earningsCitedItemSchema = z.object({
  description: z.string().min(1),
  source: earningsCitationSchema,
});
export type EarningsCitedItem = z.infer<typeof earningsCitedItemSchema>;

const citationJsonSchema = {
  type: 'object',
  properties: {
    speaker: { type: 'string', description: 'Who said this, e.g. "Alex Chen (CEO)" or "Sam Patel (Analyst, Meridian Securities)".' },
    excerpt: { type: 'string', description: 'A short, verbatim supporting quote from the transcript (under ~600 characters).' },
  },
  required: ['speaker', 'excerpt'],
} as const;

const citedItemJsonSchema = {
  type: 'object',
  properties: { description: { type: 'string' }, source: citationJsonSchema },
  required: ['description', 'source'],
} as const;

// ---------------------------------------------------------------------------
// Main structured analysis (lib/ai/analyzeEarningsCall.ts)
// ---------------------------------------------------------------------------

export const businessTrendCategorySchema = z.enum([
  'demand',
  'pricing',
  'volume',
  'customer_behavior',
  'geographic_markets',
  'product_launches',
  'competitive_environment',
  'supply_chain',
  'hiring',
  'cost_structure',
  'other',
]);
const businessTrendItemSchema = earningsCitedItemSchema.extend({ category: businessTrendCategorySchema });
export type BusinessTrendItem = z.infer<typeof businessTrendItemSchema>;

export const earningsRiskCategorySchema = z.enum([
  'demand',
  'competition',
  'regulation',
  'costs',
  'supply_chain',
  'macroeconomic',
  'liquidity',
  'technology',
  'other',
]);
const earningsRiskItemSchema = earningsCitedItemSchema.extend({ category: earningsRiskCategorySchema });
export type EarningsRiskItem = z.infer<typeof earningsRiskItemSchema>;

export const capitalAllocationCategorySchema = z.enum([
  'capex',
  'buybacks',
  'dividends',
  'acquisitions',
  'debt',
  'cash',
  'investments',
  'other',
]);
const capitalAllocationItemSchema = earningsCitedItemSchema.extend({ category: capitalAllocationCategorySchema });
export type CapitalAllocationItem = z.infer<typeof capitalAllocationItemSchema>;

export const guidanceMetricSchema = z.enum([
  'REVENUE',
  'EPS',
  'GROSS_MARGIN',
  'OPERATING_MARGIN',
  'CAPEX',
  'OPEX',
  'FREE_CASH_FLOW',
  'SEGMENT_REVENUE',
  'OTHER',
]);
const guidanceObservationItemSchema = z.object({
  metric: guidanceMetricSchema,
  metric_label: z.string().min(1),
  period: z.string().min(1),
  low: z.number().nullable(),
  high: z.number().nullable(),
  source: earningsCitationSchema,
});
export type GuidanceObservationItem = z.infer<typeof guidanceObservationItemSchema>;

const analystTopicItemSchema = z.object({
  analyst: z.string().min(1),
  firm: z.string().nullable(),
  topic: z.string().min(1).max(60),
  question_summary: z.string().min(1),
  response_summary: z.string().min(1),
  source: earningsCitationSchema,
});
export type AnalystTopicItem = z.infer<typeof analystTopicItemSchema>;

// Categorical, not numeric — "do not assign arbitrary scores without
// documenting methodology." Every level must be backed by an excerpt.
export const managementLanguageDimensionSchema = z.enum([
  'confidence',
  'caution',
  'uncertainty',
  'optimism',
  'defensiveness',
]);
export const managementLanguageLevelSchema = z.enum(['low', 'moderate', 'high']);
const managementLanguageItemSchema = z.object({
  dimension: managementLanguageDimensionSchema,
  level: managementLanguageLevelSchema,
  observation: z.string().min(1),
  source: earningsCitationSchema,
});
export type ManagementLanguageItem = z.infer<typeof managementLanguageItemSchema>;

export const earningsAnalysisSchema = z.object({
  summary: z.string().min(1),
  business_trends: z.array(businessTrendItemSchema),
  management_commentary: z.array(earningsCitedItemSchema),
  guidance_observations: z.array(guidanceObservationItemSchema),
  risks: z.array(earningsRiskItemSchema),
  capital_allocation: z.array(capitalAllocationItemSchema),
  analyst_topics: z.array(analystTopicItemSchema),
  management_language: z.array(managementLanguageItemSchema),
});
export type EarningsAnalysisPayload = z.infer<typeof earningsAnalysisSchema>;

export const EARNINGS_ANALYSIS_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'A concise executive summary of the most important developments from the call.' },
    business_trends: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['demand', 'pricing', 'volume', 'customer_behavior', 'geographic_markets', 'product_launches', 'competitive_environment', 'supply_chain', 'hiring', 'cost_structure', 'other'],
          },
          description: { type: 'string' },
          source: citationJsonSchema,
        },
        required: ['category', 'description', 'source'],
      },
      description: 'Important business trends discussed on the call (demand, pricing, volume, customer behavior, geography, product launches, competition, supply chain, hiring, cost structure).',
    },
    management_commentary: { type: 'array', items: citedItemJsonSchema, description: 'Important statements made by management.' },
    guidance_observations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: ['REVENUE', 'EPS', 'GROSS_MARGIN', 'OPERATING_MARGIN', 'CAPEX', 'OPEX', 'FREE_CASH_FLOW', 'SEGMENT_REVENUE', 'OTHER'] },
          metric_label: { type: 'string', description: 'A short human label, e.g. "Full Year Revenue" or "Q4 Operating Margin".' },
          period: { type: 'string', description: 'The period this guidance covers, e.g. "Q4 2025" or "FY2025".' },
          low: { type: ['number', 'null'], description: 'The low end of the guided range, or the single value if only one figure was given, or null.' },
          high: { type: ['number', 'null'], description: 'The high end of the guided range, or null if only a single value was given.' },
          source: citationJsonSchema,
        },
        required: ['metric', 'metric_label', 'period', 'low', 'high', 'source'],
      },
      description: 'Forward-looking guidance figures exactly as stated. Do NOT compute a midpoint or compare to prior guidance yourself — extract only what was actually said.',
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['demand', 'competition', 'regulation', 'costs', 'supply_chain', 'macroeconomic', 'liquidity', 'technology', 'other'] },
          description: { type: 'string' },
          source: citationJsonSchema,
        },
        required: ['category', 'description', 'source'],
      },
      description: 'Risks discussed by management. Only include risks supported by the transcript — never invented.',
    },
    capital_allocation: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['capex', 'buybacks', 'dividends', 'acquisitions', 'debt', 'cash', 'investments', 'other'] },
          description: { type: 'string' },
          source: citationJsonSchema,
        },
        required: ['category', 'description', 'source'],
      },
      description: 'Discussion of CapEx, buybacks, dividends, acquisitions, debt, cash, and investments.',
    },
    analyst_topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          analyst: { type: 'string' },
          firm: { type: ['string', 'null'] },
          topic: { type: 'string', description: 'A short (2-4 word) topic label, e.g. "Margins" or "AI spending". Use the SAME label for questions about the same underlying topic so they can be grouped.' },
          question_summary: { type: 'string' },
          response_summary: { type: 'string' },
          source: citationJsonSchema,
        },
        required: ['analyst', 'firm', 'topic', 'question_summary', 'response_summary', 'source'],
      },
      description: 'One entry per analyst question in the Q&A section, with a topic label for clustering.',
    },
    management_language: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: ['confidence', 'caution', 'uncertainty', 'optimism', 'defensiveness'] },
          level: { type: 'string', enum: ['low', 'moderate', 'high'] },
          observation: { type: 'string', description: 'What specifically in the language suggested this reading.' },
          source: citationJsonSchema,
        },
        required: ['dimension', 'level', 'observation', 'source'],
      },
      description: 'AI-based language analysis — an interpretation of word choice and phrasing, never a measurement of management\'s actual state of mind. Every entry must cite supporting language.',
    },
  },
  required: ['summary', 'business_trends', 'management_commentary', 'guidance_observations', 'risks', 'capital_allocation', 'analyst_topics', 'management_language'],
};

// ---------------------------------------------------------------------------
// Comparison with the previous quarter's call (lib/ai/compareEarningsCalls.ts)
// ---------------------------------------------------------------------------

export const languageChangeTypeSchema = z.enum(['New topic', 'Changed emphasis', 'Similar commentary']);
const languageChangeItemSchema = z.object({
  topic: z.string().min(1).max(60),
  change_type: languageChangeTypeSchema,
  description: z.string().min(1),
  current_source: earningsCitationSchema,
  // Null only for "New topic" — there is genuinely nothing in the prior call to cite.
  prior_source: earningsCitationSchema.nullable(),
});
export type LanguageChangeItem = z.infer<typeof languageChangeItemSchema>;

const toneComparisonItemSchema = z.object({
  dimension: managementLanguageDimensionSchema,
  note: z.string().min(1),
  current_source: earningsCitationSchema,
  prior_source: earningsCitationSchema,
});
export type ToneComparisonItem = z.infer<typeof toneComparisonItemSchema>;

export const earningsComparisonAiSchema = z.object({
  language_changes: z.array(languageChangeItemSchema),
  tone_comparison: z.array(toneComparisonItemSchema),
});
export type EarningsComparisonAiPayload = z.infer<typeof earningsComparisonAiSchema>;

export const EARNINGS_COMPARISON_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    language_changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'e.g. "Demand", "Margins", "Guidance", "Competition".' },
          change_type: { type: 'string', enum: ['New topic', 'Changed emphasis', 'Similar commentary'] },
          description: { type: 'string' },
          current_source: citationJsonSchema,
          prior_source: { ...citationJsonSchema, type: ['object', 'null'] },
        },
        required: ['topic', 'change_type', 'description', 'current_source', 'prior_source'],
      },
      description: 'Language changes vs the previous call. A wording change alone is never automatically a business change — label only what changed, do not assert why.',
    },
    tone_comparison: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: ['confidence', 'caution', 'uncertainty', 'optimism', 'defensiveness'] },
          note: { type: 'string' },
          current_source: citationJsonSchema,
          prior_source: citationJsonSchema,
        },
        required: ['dimension', 'note', 'current_source', 'prior_source'],
      },
      description: 'How management language compares to the previous call along each dimension, each backed by excerpts from both calls.',
    },
  },
  required: ['language_changes', 'tone_comparison'],
};

// ---------------------------------------------------------------------------
// Cross-source comparison: earnings call vs SEC filing
// (lib/ai/compareEarningsToFiling.ts)
// ---------------------------------------------------------------------------

const filingSourceSchema = z.object({
  section: z.string().min(1),
  excerpt: z.string().min(1).max(600),
});

const crossSourceItemSchema = z.object({
  topic: z.string().min(1).max(80),
  description: z.string().min(1),
  call_source: earningsCitationSchema.nullable(),
  filing_source: filingSourceSchema.nullable(),
});
export type CrossSourceItem = z.infer<typeof crossSourceItemSchema>;

export const earningsFilingComparisonAiSchema = z.object({
  alignments: z.array(crossSourceItemSchema),
  new_in_call: z.array(crossSourceItemSchema),
  only_in_filing: z.array(crossSourceItemSchema),
  risk_emphasis_differences: z.array(crossSourceItemSchema),
  guidance_differences: z.array(crossSourceItemSchema),
});
export type EarningsFilingComparisonAiPayload = z.infer<typeof earningsFilingComparisonAiSchema>;

const filingSourceJsonSchema = {
  type: 'object',
  properties: {
    section: { type: 'string', description: 'The SEC filing section this is drawn from, e.g. "Risk Factors".' },
    excerpt: { type: 'string' },
  },
  required: ['section', 'excerpt'],
} as const;

const crossSourceItemJsonSchema = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    description: { type: 'string', description: 'Use neutral framing, e.g. "Potential difference in emphasis" — never claim management is contradicting the filing.' },
    call_source: { ...citationJsonSchema, type: ['object', 'null'] },
    filing_source: { ...filingSourceJsonSchema, type: ['object', 'null'] },
  },
  required: ['topic', 'description', 'call_source', 'filing_source'],
} as const;

export const EARNINGS_FILING_COMPARISON_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    alignments: { type: 'array', items: crossSourceItemJsonSchema, description: 'Topics where the call\'s commentary aligns with the filing\'s disclosures (both call_source and filing_source present).' },
    new_in_call: { type: 'array', items: crossSourceItemJsonSchema, description: 'Information that appears in the call but not the filing (filing_source null).' },
    only_in_filing: { type: 'array', items: crossSourceItemJsonSchema, description: 'Information in the filing not raised on the call (call_source null).' },
    risk_emphasis_differences: { type: 'array', items: crossSourceItemJsonSchema, description: 'Risks emphasized differently between the two sources.' },
    guidance_differences: { type: 'array', items: crossSourceItemJsonSchema, description: 'Places guidance or outlook language differs between the two sources.' },
  },
  required: ['alignments', 'new_in_call', 'only_in_filing', 'risk_emphasis_differences', 'guidance_differences'],
};
