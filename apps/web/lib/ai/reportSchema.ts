import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * The structured-output contract for the AI research report — same "do not
 * allow the LLM to return arbitrary free-form data" discipline as
 * lib/ai/schema.ts (Milestone 7) and lib/ai/earningsSchema.ts (Milestone 8).
 *
 * The critical difference from those two: this schema is NARRATIVE ONLY.
 * There is no field anywhere here for a dollar figure, a percentage, a
 * multiple, or a share price — every number in the final report (financial
 * performance, DCF/comps output, scenario values, key metrics) is computed
 * deterministically by lib/research/aggregateResearchContext.ts and merged
 * in server-side; the model only ever explains, synthesizes, and organizes
 * text around numbers it is never asked to reproduce. This is the concrete
 * mechanism behind "do NOT let the LLM calculate financial metrics."
 *
 * Every item that makes a specific claim carries `source_ids: number[]` —
 * indices into the backend-built ResearchSource[] registry
 * (lib/research/types.ts). The model may only cite IDs it was shown in the
 * prompt; lib/ai/generateResearchReport.ts strips any ID that doesn't
 * actually exist in the registry before the report is ever stored — the
 * backend injects valid sources, it never trusts the model's own citations.
 */

const sourceIdsSchema = z.array(z.number().int().positive());
const sourceIdsJsonSchema = {
  type: 'array',
  items: { type: 'integer', minimum: 1 },
  description: 'IDs into the provided source list this claim is drawn from. Only cite IDs that were given to you — never invent one.',
} as const;

const narrativeSectionSchema = z.object({
  text: z.string().min(1),
  source_ids: sourceIdsSchema,
});
const narrativeSectionJsonSchema = {
  type: 'object',
  properties: { text: { type: 'string' }, source_ids: sourceIdsJsonSchema },
  required: ['text', 'source_ids'],
} as const;

// ---------------------------------------------------------------------------
// Executive summary, company overview, financial/growth/valuation/DCF/comps
// commentary, scenario commentary, management & capital allocation — all
// share the same {text, source_ids} shape.
// ---------------------------------------------------------------------------

export const executiveSummarySchema = narrativeSectionSchema;
export const companyOverviewNarrativeSchema = narrativeSectionSchema;
export const financialAnalysisNarrativeSchema = narrativeSectionSchema;
export const valuationCommentarySchema = narrativeSectionSchema;
export const dcfCommentarySchema = narrativeSectionSchema;
export const compsCommentarySchema = narrativeSectionSchema;
export const scenarioCommentarySchema = narrativeSectionSchema;
export const managementCapitalAllocationSchema = narrativeSectionSchema;

// ---------------------------------------------------------------------------
// Growth analysis — structured drivers, each categorized and cited.
// ---------------------------------------------------------------------------

export const growthDriverCategorySchema = z.enum([
  'volume',
  'pricing',
  'new_products',
  'market_expansion',
  'acquisitions',
  'customer_growth',
  'market_share',
  'industry_growth',
  'other',
]);
const growthDriverItemSchema = z.object({
  category: growthDriverCategorySchema,
  description: z.string().min(1),
  source_ids: sourceIdsSchema,
});
export type GrowthDriverItem = z.infer<typeof growthDriverItemSchema>;

const growthAnalysisSchema = z.object({ drivers: z.array(growthDriverItemSchema) });

// ---------------------------------------------------------------------------
// SEC filing insights
// ---------------------------------------------------------------------------

export const secInsightCategorySchema = z.enum([
  'filing_development',
  'new_risk',
  'financial_change',
  'liquidity',
  'capital_allocation',
  'accounting_change',
  'corporate_event',
  'other',
]);
const secInsightItemSchema = z.object({
  category: secInsightCategorySchema,
  description: z.string().min(1),
  source_ids: sourceIdsSchema,
});
export type SecInsightItem = z.infer<typeof secInsightItemSchema>;

const secAnalysisSchema = z.object({ insights: z.array(secInsightItemSchema) });

// ---------------------------------------------------------------------------
// Earnings-call insights
// ---------------------------------------------------------------------------

export const earningsInsightCategorySchema = z.enum([
  'management_theme',
  'guidance',
  'guidance_change',
  'business_trend',
  'analyst_concern',
  'management_commentary',
  'capital_allocation',
  'notable_change',
  'other',
]);
const earningsInsightItemSchema = z.object({
  category: earningsInsightCategorySchema,
  description: z.string().min(1),
  source_ids: sourceIdsSchema,
});
export type EarningsInsightItem = z.infer<typeof earningsInsightItemSchema>;

const earningsAnalysisSchema = z.object({ insights: z.array(earningsInsightItemSchema) });

// ---------------------------------------------------------------------------
// Catalysts — always labeled "Potential catalyst" in the UI, never a
// guaranteed outcome; the model supplies category + description + citations only.
// ---------------------------------------------------------------------------

export const catalystCategorySchema = z.enum([
  'earnings',
  'new_products',
  'acquisitions',
  'cost_reductions',
  'margin_expansion',
  'buybacks',
  'regulatory',
  'new_markets',
  'guidance_change',
  'other',
]);
const catalystItemSchema = z.object({
  category: catalystCategorySchema,
  description: z.string().min(1),
  source_ids: sourceIdsSchema,
});
export type CatalystItem = z.infer<typeof catalystItemSchema>;

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

export const riskCategorySchema = z.enum([
  'financial',
  'operational',
  'competitive',
  'regulatory',
  'macroeconomic',
  'liquidity',
  'execution',
  'valuation',
]);
const riskItemSchema = z.object({
  category: riskCategorySchema,
  risk: z.string().min(1),
  why_it_matters: z.string().min(1),
  evidence: z.string().min(1),
  source_ids: sourceIdsSchema,
});
export type ReportRiskItem = z.infer<typeof riskItemSchema>;

// ---------------------------------------------------------------------------
// Conclusion — neutral, structured, no buy/sell language (enforced by prompt
// instruction; the schema itself just requires each field be present).
// ---------------------------------------------------------------------------

const conclusionSchema = z.object({
  what_is_working: z.string().min(1),
  what_is_deteriorating: z.string().min(1),
  valuation_implication: z.string().min(1),
  key_assumptions: z.string().min(1),
  what_could_change_thesis: z.string().min(1),
  source_ids: sourceIdsSchema,
});

// ---------------------------------------------------------------------------
// Top-level report schema
// ---------------------------------------------------------------------------

export const researchReportAiSchema = z.object({
  executive_summary: executiveSummarySchema,
  company_overview_narrative: companyOverviewNarrativeSchema,
  financial_analysis_narrative: financialAnalysisNarrativeSchema,
  growth_analysis: growthAnalysisSchema,
  valuation_commentary: valuationCommentarySchema,
  dcf_commentary: dcfCommentarySchema,
  comps_commentary: compsCommentarySchema,
  sec_analysis: secAnalysisSchema,
  earnings_analysis: earningsAnalysisSchema,
  catalysts: z.array(catalystItemSchema),
  risks: z.array(riskItemSchema),
  management_capital_allocation: managementCapitalAllocationSchema,
  scenario_commentary: scenarioCommentarySchema,
  conclusion: conclusionSchema,
});
export type ResearchReportAiPayload = z.infer<typeof researchReportAiSchema>;

// ---------------------------------------------------------------------------
// Hand-written JSON Schema mirror for the Anthropic tool call — kept in sync
// by hand and cross-checked in reportSchema.test.ts, same as Milestones 7/8.
// ---------------------------------------------------------------------------

const categorizedItemJsonSchema = (categoryEnum: readonly string[], categoryDescription: string) => ({
  type: 'object',
  properties: {
    category: { type: 'string', enum: categoryEnum, description: categoryDescription },
    description: { type: 'string' },
    source_ids: sourceIdsJsonSchema,
  },
  required: ['category', 'description', 'source_ids'],
});

export const RESEARCH_REPORT_TOOL_SCHEMA: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    executive_summary: {
      ...narrativeSectionJsonSchema,
      description: 'Concise summary covering business, financial performance, growth, profitability, valuation, major risks, and important recent developments. No personalized investment recommendation.',
    },
    company_overview_narrative: {
      ...narrativeSectionJsonSchema,
      description: "The company's business description, grounded only in the provided context. Never invent a business description.",
    },
    financial_analysis_narrative: {
      ...narrativeSectionJsonSchema,
      description: 'Analysis of revenue growth, margins, EPS, and cash flow trends — acceleration, deceleration, margin expansion/compression, cash-flow changes. Every numerical claim must reference the provided financial data.',
    },
    growth_analysis: {
      type: 'object',
      properties: {
        drivers: {
          type: 'array',
          items: categorizedItemJsonSchema(growthDriverCategorySchema.options, 'The type of growth driver.'),
          description: 'Growth drivers — only include one if it is supported by the provided SEC filing or earnings-call context. Do not invent explanations for financial performance.',
        },
      },
      required: ['drivers'],
    },
    valuation_commentary: { ...narrativeSectionJsonSchema, description: 'Commentary on the DCF and comps valuation outputs together — never recalculates them.' },
    dcf_commentary: { ...narrativeSectionJsonSchema, description: 'Explains the implications of the existing DCF model outputs (assumptions, WACC, terminal value, Base/Bear/Bull) — never invents new assumptions or numbers.' },
    comps_commentary: { ...narrativeSectionJsonSchema, description: 'Explains whether the target trades above, near, or below peer median multiples, and why that matters — never calls the company "cheap" or "expensive" without naming the specific multiple and context.' },
    sec_analysis: {
      type: 'object',
      properties: {
        insights: {
          type: 'array',
          items: categorizedItemJsonSchema(secInsightCategorySchema.options, 'The type of SEC filing insight.'),
          description: 'Insights synthesized from the provided SEC filing analysis only.',
        },
      },
      required: ['insights'],
    },
    earnings_analysis: {
      type: 'object',
      properties: {
        insights: {
          type: 'array',
          items: categorizedItemJsonSchema(earningsInsightCategorySchema.options, 'The type of earnings-call insight.'),
          description: 'Insights synthesized from the provided earnings-call analysis only. Never present AI sentiment analysis as objective truth.',
        },
      },
      required: ['insights'],
    },
    catalysts: {
      type: 'array',
      items: categorizedItemJsonSchema(catalystCategorySchema.options, 'The type of potential catalyst.'),
      description: 'Potential catalysts only — every one must have a source and must never be presented as a guaranteed outcome. Do not invent future events.',
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: riskCategorySchema.options },
          risk: { type: 'string' },
          why_it_matters: { type: 'string' },
          evidence: { type: 'string' },
          source_ids: sourceIdsJsonSchema,
        },
        required: ['category', 'risk', 'why_it_matters', 'evidence', 'source_ids'],
      },
      description: 'Risks prioritized by evidence from company disclosures — never exaggerated.',
    },
    management_capital_allocation: { ...narrativeSectionJsonSchema, description: "Synthesizes management's capital-allocation commentary and priorities across the provided SEC and earnings-call context." },
    scenario_commentary: { ...narrativeSectionJsonSchema, description: 'Explains the main differences between the Bear/Base/Bull DCF scenarios — all numeric values come from the provided DCF context, never invented here.' },
    conclusion: {
      type: 'object',
      properties: {
        what_is_working: { type: 'string' },
        what_is_deteriorating: { type: 'string' },
        valuation_implication: { type: 'string', description: 'e.g. "Valuation is highly sensitive to..." — never "Buy"/"Sell"/"Strong Buy"/"Strong Sell".' },
        key_assumptions: { type: 'string' },
        what_could_change_thesis: { type: 'string' },
        source_ids: sourceIdsJsonSchema,
      },
      required: ['what_is_working', 'what_is_deteriorating', 'valuation_implication', 'key_assumptions', 'what_could_change_thesis', 'source_ids'],
      description: 'A neutral research conclusion. Never a buy/sell recommendation.',
    },
  },
  required: [
    'executive_summary',
    'company_overview_narrative',
    'financial_analysis_narrative',
    'growth_analysis',
    'valuation_commentary',
    'dcf_commentary',
    'comps_commentary',
    'sec_analysis',
    'earnings_analysis',
    'catalysts',
    'risks',
    'management_capital_allocation',
    'scenario_commentary',
    'conclusion',
  ],
};
