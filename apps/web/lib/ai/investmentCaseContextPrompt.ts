import { formatPrice, formatRatioAsPercent } from '@/lib/utils/format';
import type { InvestmentCaseContext } from '@/lib/investmentCase/context';

/**
 * The shared "render an InvestmentCaseContext as prompt text" block — used
 * identically by the AI Thesis Assistant (lib/ai/investmentThesisPrompts.ts)
 * and the Investment Memo narrative generator
 * (lib/ai/investmentMemoPrompts.ts), so the two AI features never describe
 * the same case data two different (and potentially inconsistent) ways.
 */

export function formatAssumptionValue(unit: string, value: number): string {
  if (unit === 'ratio') return formatRatioAsPercent(value * 100);
  if (unit === 'usd' || unit === 'usd_per_share') return formatPrice(value);
  return `${value}`;
}

export function renderInvestmentCaseContext(context: InvestmentCaseContext): string {
  const baseAssumptions = context.assumptions.filter((a) => a.scenario === 'BASE');

  return [
    `Company: ${context.companyName} (${context.ticker})`,
    `Case status: ${context.status}`,
    `Investment horizon: ${context.horizon}`,
    '',
    '# Core Thesis',
    context.coreThesis,
    '',
    '# Key Drivers',
    context.keyDrivers.length > 0 ? context.keyDrivers.map((d) => `- ${d}`).join('\n') : 'None recorded.',
    '',
    '# Assumptions (Base case)',
    baseAssumptions.length > 0
      ? baseAssumptions.map((a) => `- ${a.label}: ${formatAssumptionValue(a.unit, a.value)} (confidence: ${a.confidence})`).join('\n')
      : 'None recorded.',
    '',
    '# Evidence (cite by id — the value in brackets)',
    context.evidence.length > 0
      ? context.evidence.map((e) => `- [id: ${e.id}] [${e.direction}, strength: ${e.strength}] ${e.claim} — ${e.evidence} (Source: ${e.sourceLabel}, type: ${e.sourceType})`).join('\n')
      : 'None recorded.',
    '',
    '# Risks',
    context.risks.length > 0
      ? context.risks.map((r) => `- ${r.risk} (impact: ${r.impact}, probability: ${r.probability ?? 'not assessed'}, status: ${r.status})`).join('\n')
      : 'None recorded.',
    '',
    '# Catalysts',
    context.catalysts.length > 0
      ? context.catalysts.map((c) => `- ${c.catalyst} (timeframe: ${c.timeframe}, potential impact: ${c.potentialImpact}, status: ${c.status})`).join('\n')
      : 'None recorded.',
    '',
    '# What would strengthen the thesis',
    context.strengthenIndicators.length > 0 ? context.strengthenIndicators.map((s) => `- ${s}`).join('\n') : 'None recorded.',
    '',
    '# What would weaken the thesis',
    context.weakenIndicators.length > 0 ? context.weakenIndicators.map((s) => `- ${s}`).join('\n') : 'None recorded.',
    '',
    '# Invalidation criteria (user-defined; never auto-triggered)',
    context.invalidationCriteria.length > 0 ? context.invalidationCriteria.map((c) => `- ${c.description}`).join('\n') : 'None recorded.',
    context.invalidateIndicators.length > 0 ? context.invalidateIndicators.map((s) => `- ${s}`).join('\n') : '',
    '',
    '# Financials (current)',
    `Revenue: ${context.financials.revenue !== null ? formatPrice(context.financials.revenue) : 'n/a'}, Revenue Growth: ${context.financials.revenueGrowth !== null ? formatRatioAsPercent(context.financials.revenueGrowth * 100) : 'n/a'}, Operating Margin: ${context.financials.operatingMargin !== null ? formatRatioAsPercent(context.financials.operatingMargin * 100) : 'n/a'}, Free Cash Flow: ${context.financials.freeCashFlow !== null ? formatPrice(context.financials.freeCashFlow) : 'n/a'}`,
    '',
    '# Live valuation (current, not historical)',
    `Current price: ${context.valuation.currentSharePrice !== null ? formatPrice(context.valuation.currentSharePrice) : 'n/a'}, DCF Base: ${context.valuation.dcfBase !== null ? formatPrice(context.valuation.dcfBase) : 'n/a'}, DCF Bull: ${context.valuation.dcfBull !== null ? formatPrice(context.valuation.dcfBull) : 'n/a'}, DCF Bear: ${context.valuation.dcfBear !== null ? formatPrice(context.valuation.dcfBear) : 'n/a'}, Comps Implied: ${context.valuation.compsImplied !== null ? formatPrice(context.valuation.compsImplied) : 'n/a'}`,
    '',
    '# Deterministic thesis challenges (already computed by Atlas — never framed as "thesis broken")',
    context.challenges.length > 0
      ? context.challenges
          .map((c) => `- ${c.label}: thesis assumed ${formatAssumptionValue(c.unit, c.thesisAssumption)}, live value is ${formatAssumptionValue(c.unit, c.currentValue)} (source: ${c.source})`)
          .join('\n')
      : 'None currently flagged.',
    '',
    '# Recent research events (cite by id — the value in brackets)',
    context.recentResearchEvents.length > 0
      ? context.recentResearchEvents.map((e) => `- [id: ${e.id}] [${e.materiality}] ${e.title} (${e.eventDate})`).join('\n')
      : 'None recorded.',
  ].join('\n');
}
