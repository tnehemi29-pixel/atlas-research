import { formatCompactCurrency, formatCompactNumber, formatMultiple, formatRatioAsPercent } from './format';

/**
 * Shared value-unit formatting for anything rendering a ResearchEventChange
 * or ThesisAssumption/AssumptionComparison value — used by the research
 * feed, company timeline, and thesis monitor UIs so a "usd_per_share" or
 * "bps" value never gets formatted three different ways across those three
 * screens. Mirrors lib/ai/researchEventPrompts.ts's own formatChangeValue,
 * kept separate since that one is server-only (feeds the AI prompt) and
 * this one is client-safe.
 */
export const MATERIALITY_STYLE: Record<string, string> = {
  LOW: 'border-ink/15 bg-ink/5 text-ink/50',
  MEDIUM: 'border-amber-300 bg-amber-50 text-amber-800',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-800',
  CRITICAL: 'border-red-300 bg-red-50 text-red-700',
};

export const RESEARCH_EVENT_CATEGORY_LABELS: Record<string, string> = {
  SEC_FILING: 'SEC Filing',
  EARNINGS: 'Earnings',
  FINANCIAL: 'Financial',
  VALUATION: 'Valuation',
  CORPORATE_EVENT: 'Corporate Event',
};

export function formatResearchEventValue(unit: string, value: number | null): string {
  if (value === null) return '—';
  switch (unit) {
    case 'usd':
      return formatCompactCurrency(value);
    case 'usd_per_share':
      return `$${value.toFixed(2)}`;
    case 'ratio':
      return formatRatioAsPercent(value);
    case 'bps':
      return `${value >= 0 ? '+' : ''}${value.toFixed(0)} bps`;
    case 'multiple':
      return formatMultiple(value);
    case 'count':
      return formatCompactNumber(value);
    default:
      return String(value);
  }
}
