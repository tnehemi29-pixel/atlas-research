import type { ResearchArea, ResearchEventType } from '@prisma/client';
import type { EightKCategory } from '@/lib/sec/eightKItems';

/**
 * Deterministic, rule-based "what part of the existing research might this
 * touch" — never an AI judgment call, and never "the model changed the
 * DCF." Every note is phrased as a possibility ("Potentially affects..."),
 * per the milestone spec's explicit instruction: "Do not automatically
 * change DCF assumptions. Instead say: 'Potentially affects DCF revenue
 * assumptions.'" This table is what `ResearchEventImpact` rows are built
 * from — always present for a stored event, whether or not the optional AI
 * narrative ever runs.
 */

export interface ImpactMappingEntry {
  area: ResearchArea;
  note: string;
}

const GUIDANCE_CHANGE_IMPACTS: ImpactMappingEntry[] = [
  { area: 'FINANCIALS', note: 'Potentially affects near-term financial forecasts.' },
  { area: 'GROWTH', note: 'Potentially affects the growth-rate assumptions underlying the research.' },
  { area: 'DCF', note: 'Potentially affects DCF revenue and margin assumptions.' },
  { area: 'INVESTMENT_THESIS', note: 'Potentially affects the overall investment thesis.' },
];

const FINANCIAL_CHANGE_IMPACTS: ImpactMappingEntry[] = [
  { area: 'FINANCIALS', note: 'Reflects an actual change in reported financial results.' },
  { area: 'GROWTH', note: 'Potentially affects the growth trajectory used in the research.' },
];

const MARGIN_CHANGE_IMPACTS: ImpactMappingEntry[] = [
  { area: 'MARGINS', note: 'Reflects an actual change in reported margins.' },
  { area: 'DCF', note: 'Potentially affects DCF margin assumptions.' },
];

const DCF_VALUATION_CHANGE_IMPACTS: ImpactMappingEntry[] = [
  { area: 'DCF', note: 'The DCF-implied valuation itself moved — see the underlying input changes.' },
  { area: 'INVESTMENT_THESIS', note: 'Potentially affects the valuation case within the investment thesis.' },
];

const COMPS_VALUATION_CHANGE_IMPACTS: ImpactMappingEntry[] = [
  { area: 'COMPS', note: 'Peer or target multiples moved — see the underlying multiple changes.' },
  { area: 'INVESTMENT_THESIS', note: 'Potentially affects the relative-valuation case within the investment thesis.' },
];

const NEW_FILING_IMPACTS: ImpactMappingEntry[] = [
  { area: 'FINANCIALS', note: 'A new filing may contain updated financial disclosures worth reviewing.' },
  { area: 'RISKS', note: 'A new filing may contain updated or new risk-factor disclosures.' },
];

const NEW_RISK_IMPACTS: ImpactMappingEntry[] = [
  { area: 'RISKS', note: 'A new risk was disclosed that the existing research may not account for.' },
  { area: 'INVESTMENT_THESIS', note: 'Potentially affects the risk considerations within the investment thesis.' },
];

const NEW_RESEARCH_REPORT_IMPACTS: ImpactMappingEntry[] = [
  { area: 'INVESTMENT_THESIS', note: 'A new or updated research report synthesizes the latest available data.' },
];

const EARNINGS_CALL_IMPACTS: ImpactMappingEntry[] = [
  { area: 'FINANCIALS', note: 'Management commentary may clarify or contextualize recent financial results.' },
  { area: 'MANAGEMENT', note: 'Potentially reflects new management commentary or tone.' },
  { area: 'CATALYSTS', note: 'Earnings calls often surface near-term catalysts worth tracking.' },
];

const EIGHT_K_CATEGORY_IMPACTS: Partial<Record<EightKCategory, ImpactMappingEntry[]>> = {
  ACQUISITION: [
    { area: 'CAPITAL_ALLOCATION', note: 'Reflects a capital-allocation decision (acquisition or disposition).' },
    { area: 'GROWTH', note: 'Potentially affects the growth thesis if the transaction changes the business mix.' },
    { area: 'INVESTMENT_THESIS', note: 'Potentially affects the overall investment thesis.' },
  ],
  EXECUTIVE_CHANGE: [
    { area: 'MANAGEMENT', note: 'A change in leadership may affect the management-quality assessment.' },
    { area: 'INVESTMENT_THESIS', note: 'Potentially affects the overall investment thesis.' },
  ],
  FINANCING: [
    { area: 'CAPITAL_ALLOCATION', note: 'Reflects a new financing or financial-obligation event.' },
    { area: 'DCF', note: 'Potentially affects the capital structure / WACC assumptions in the DCF.' },
  ],
  BANKRUPTCY_RESTRUCTURING: [
    { area: 'RISKS', note: 'Reflects a significant liquidity or solvency development.' },
    { area: 'CAPITAL_ALLOCATION', note: 'Potentially affects the company’s ability to allocate capital as previously assumed.' },
    { area: 'INVESTMENT_THESIS', note: 'Potentially materially affects the overall investment thesis.' },
  ],
  MAJOR_CONTRACT: [
    { area: 'GROWTH', note: 'A material agreement may affect the growth outlook.' },
    { area: 'CATALYSTS', note: 'Potentially represents a new catalyst worth tracking.' },
  ],
  LEGAL_EVENT: [
    { area: 'RISKS', note: 'Reflects a material legal or regulatory development.' },
    { area: 'INVESTMENT_THESIS', note: 'Potentially affects the risk considerations within the investment thesis.' },
  ],
};

const DEFAULT_CORPORATE_EVENT_IMPACTS: ImpactMappingEntry[] = [{ area: 'INVESTMENT_THESIS', note: 'Potentially affects the overall investment thesis.' }];

export function getImpactedResearchAreas(type: ResearchEventType, context: { eightKCategory?: EightKCategory } = {}): ImpactMappingEntry[] {
  switch (type) {
    case 'GUIDANCE_CHANGE':
      return GUIDANCE_CHANGE_IMPACTS;
    case 'FINANCIAL_CHANGE':
      return FINANCIAL_CHANGE_IMPACTS;
    case 'MARGIN_CHANGE':
      return MARGIN_CHANGE_IMPACTS;
    case 'DCF_VALUATION_CHANGE':
      return DCF_VALUATION_CHANGE_IMPACTS;
    case 'COMPS_VALUATION_CHANGE':
      return COMPS_VALUATION_CHANGE_IMPACTS;
    case 'NEW_FILING':
      return NEW_FILING_IMPACTS;
    case 'NEW_RISK':
      return NEW_RISK_IMPACTS;
    case 'NEW_RESEARCH_REPORT':
    case 'RESEARCH_REPORT_UPDATED':
      return NEW_RESEARCH_REPORT_IMPACTS;
    case 'EARNINGS_CALL':
      return EARNINGS_CALL_IMPACTS;
    case 'CORPORATE_EVENT':
      return (context.eightKCategory ? EIGHT_K_CATEGORY_IMPACTS[context.eightKCategory] : undefined) ?? DEFAULT_CORPORATE_EVENT_IMPACTS;
    default:
      return DEFAULT_CORPORATE_EVENT_IMPACTS;
  }
}
