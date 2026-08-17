import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';

/**
 * The research-event explanation prompt. Every number the model sees is
 * already computed and already formatted (lib/researchEvents/changeDetection.ts
 * + lib/utils/format.ts) — the model explains, it never calculates. The
 * user prompt also lists the deterministic research-area impacts already
 * derived from lib/researchEvents/impactMapping.ts, so the model's own
 * `affected_research_areas` selection is grounded in the same rule table,
 * not an independent guess.
 */

export const RESEARCH_EVENT_SYSTEM_PROMPT = `You are a research-monitoring assistant for Atlas Research, an institutional equity research platform. You explain research events that Atlas's own deterministic detection engine has already identified and already computed the numbers for — you never calculate, verify, or restate a number yourself, and you never introduce a fact that isn't in the context you're given.

Rules you must follow without exception:
- Use ONLY the information in the event context below. Never invent a fact, a figure, a management quote, or a cause not stated in the context.
- You are explaining a change, not recommending an action. Never output "Buy", "Sell", "Strong Buy", "Strong Sell", or any investment recommendation.
- Never claim a financial model, a DCF, comps, or a research thesis has been "changed" or "broken" — only that something is "potentially affected" or "potentially inconsistent with" a prior assumption. The actual models are never modified by you or by this event.
- "affected_research_areas" must only contain values from the research areas listed in the context below — never invent a new category.
- "confidence" reflects how directly the given source data supports your explanation, not a prediction about what will happen next — never let it imply certainty about future outcomes.
- "questions_to_investigate" should be specific and actionable — what a research analyst should actually go look at next, not generic advice.
- Write for a professional research analyst: concise, factual, neutral tone, no marketing language.`;

export interface ResearchEventChangeContext {
  metric: string;
  unit: string;
  previousValue: number | null;
  currentValue: number | null;
  changePercent: number | null;
}

export interface ResearchEventImpactContext {
  area: string;
  note: string;
}

export interface ResearchEventSourceContext {
  type: string;
  label: string;
  detail?: string | null;
}

export interface ResearchEventPromptInput {
  companyName: string;
  ticker: string;
  category: string;
  materiality: string;
  eventTitle: string;
  eventDescription: string;
  changes: ResearchEventChangeContext[];
  deterministicImpacts: ResearchEventImpactContext[];
  sources: ResearchEventSourceContext[];
}

function formatChangeValue(unit: string, value: number | null): string {
  if (value === null) return 'unavailable';
  switch (unit) {
    case 'usd':
      return formatCompactCurrency(value);
    case 'usd_per_share':
      return `$${value.toFixed(2)}`;
    case 'ratio':
      return formatRatioAsPercent(value * 100);
    case 'bps':
      return `${value >= 0 ? '+' : ''}${value.toFixed(0)} bps`;
    case 'multiple':
      return `${value.toFixed(1)}x`;
    case 'count':
      return value.toLocaleString();
    default:
      return String(value);
  }
}

function renderChange(change: ResearchEventChangeContext): string {
  const previous = formatChangeValue(change.unit, change.previousValue);
  const current = formatChangeValue(change.unit, change.currentValue);
  const pct = change.changePercent !== null ? ` (${formatRatioAsPercent(change.changePercent * 100)})` : '';
  return `- ${change.metric}: ${previous} → ${current}${pct}`;
}

export function buildResearchEventUserPrompt(input: ResearchEventPromptInput): string {
  const allowedAreas = ['FINANCIALS', 'GROWTH', 'MARGINS', 'DCF', 'COMPS', 'RISKS', 'CATALYSTS', 'MANAGEMENT', 'CAPITAL_ALLOCATION', 'INVESTMENT_THESIS'];

  return [
    `Company: ${input.companyName} (${input.ticker})`,
    `Event category: ${input.category}`,
    `Materiality: ${input.materiality}`,
    `Event title: ${input.eventTitle}`,
    `Event description: ${input.eventDescription}`,
    '',
    '# Deterministically Computed Changes',
    input.changes.length > 0 ? input.changes.map(renderChange).join('\n') : 'None recorded.',
    '',
    '# Deterministic Research-Area Impacts (rule-based, already determined)',
    input.deterministicImpacts.length > 0 ? input.deterministicImpacts.map((i) => `- ${i.area}: ${i.note}`).join('\n') : 'None recorded.',
    '',
    '# Allowed values for affected_research_areas',
    allowedAreas.join(', '),
    '',
    '# Sources',
    input.sources.map((s) => `- [${s.type}] ${s.label}${s.detail ? ` — ${s.detail}` : ''}`).join('\n'),
    '',
    'Explain this event and call the tool with your findings.',
  ].join('\n');
}
