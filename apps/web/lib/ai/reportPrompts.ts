import type { ResearchContext, ResearchDcfScenario, ResearchSource } from '@/lib/research/types';
import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';
import { truncateDescriptionList, truncateStringList } from './reportSectionSelection';

/**
 * The research-report prompt. The user prompt renders the ENTIRE aggregated
 * ResearchContext into plain text, formatted with the exact same helpers the
 * UI uses (formatCompactCurrency/formatRatioAsPercent) — the model reads
 * numbers already in their final display form, never raw floats it might be
 * tempted to "clean up" or recompute. The system prompt is where every
 * hallucination-control rule from the milestone spec is stated explicitly.
 */

export const RESEARCH_REPORT_SYSTEM_PROMPT = `You are an equity-research analysis assistant for Atlas Research, an institutional research platform. You synthesize ALREADY-COMPUTED research data into a structured research report for a professional analyst. You are not a chatbot and you do not answer open-ended questions — you organize and explain the specific data you are given.

Rules you must follow without exception:
- You are NOT a financial advisor. Never output "Buy", "Sell", "Strong Buy", "Strong Sell", or any personalized investment recommendation. Use neutral research language such as "Valuation is highly sensitive to...", "The primary uncertainty is...", "The current valuation assumes...", "The key variable to monitor is...".
- Use ONLY the information contained in the research context below. Never invent a financial number, an analyst estimate, a management quote, a corporate event, a source, a catalyst, or a risk that isn't grounded in the provided context.
- Every numeric figure you mention (revenue, margins, DCF/comps output, scenario values) MUST already appear in the context, stated exactly as given — you explain and contextualize numbers, you never calculate, restate imprecisely, or invent one. If you need to reference a number, use the number as written in the context.
- Every item you generate requires "source_ids": an array of IDs from the "AVAILABLE SOURCES" list below. Only cite IDs that are actually listed there — never invent a source ID. An empty array is fine for a purely general statement, but any specific factual claim should cite the source(s) it came from.
- If the context does not contain enough information to support a conclusion in a given area, say so explicitly — write "Insufficient data to determine." rather than guessing or omitting the section silently.
- Growth drivers, catalysts, and risks must each be grounded in the provided SEC filing insights, earnings-call insights, or financial data — never invented to fill out the section. It is completely valid to return an empty array when nothing in the context supports an item.
- Label every catalyst as a possibility, not a certainty — your descriptions should read as "potential," not guaranteed outcomes (the UI will also label these "Potential catalyst").
- For comparable-company commentary: never describe the company as "cheap" or "expensive" without naming the specific multiple (e.g. EV/EBITDA) and stating how it compares to the peer median.
- The conclusion must be neutral and structured — what is working, what is deteriorating, what valuation implies, which assumptions matter most, what could change the thesis. Never a recommendation.
- Write for a professional analyst: concise, factual, no marketing language, no hedge-fund-pitch tone.`;

function formatScenario(scenario: ResearchDcfScenario): string {
  return [
    `  ${scenario.label} case:`,
    `    Final-year revenue: ${formatCompactCurrency(scenario.finalYearRevenue)}`,
    `    Final-year operating margin: ${formatRatioAsPercent(scenario.finalYearOperatingMargin !== null ? scenario.finalYearOperatingMargin * 100 : null)}`,
    `    Final-year unlevered FCF: ${formatCompactCurrency(scenario.finalYearUnleveredFcf)}`,
    `    WACC: ${formatRatioAsPercent(scenario.wacc !== null ? scenario.wacc * 100 : null)}`,
    `    Terminal growth rate: ${formatRatioAsPercent(scenario.terminalGrowthRate !== null ? scenario.terminalGrowthRate * 100 : null)}`,
    `    Terminal value share of EV: ${formatRatioAsPercent(scenario.terminalValueSharePct !== null ? scenario.terminalValueSharePct * 100 : null)}`,
    `    Enterprise value: ${formatCompactCurrency(scenario.enterpriseValue)}`,
    `    Equity value: ${formatCompactCurrency(scenario.equityValue)}`,
    `    Implied share price: ${formatCompactCurrency(scenario.impliedSharePrice)}`,
    `    Upside/downside vs. current price: ${formatRatioAsPercent(scenario.upsideDownside !== null ? scenario.upsideDownside * 100 : null)}`,
    scenario.issues.length > 0 ? `    Blocking issues: ${scenario.issues.join('; ')}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function renderCompanyOverview(context: ResearchContext): string {
  const c = context.companyOverview;
  return [
    `Ticker: ${c.ticker}`,
    `Name: ${c.name}`,
    `Sector: ${c.sector ?? 'unavailable'}`,
    `Industry: ${c.industry ?? 'unavailable'}`,
    `Exchange: ${c.exchange ?? 'unavailable'}`,
    `Country: ${c.country ?? 'unavailable'}`,
    `Current price: ${formatCompactCurrency(c.price)}`,
    `Market capitalization: ${formatCompactCurrency(c.marketCap)}`,
    `Enterprise value: ${formatCompactCurrency(c.enterpriseValue)}`,
    `Beta: ${c.beta ?? 'unavailable'}`,
    `52-week range: ${formatCompactCurrency(c.yearLow)} - ${formatCompactCurrency(c.yearHigh)}`,
    c.quoteStale ? 'Note: market quote is a stale cached snapshot.' : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function renderFinancialPerformance(context: ResearchContext): string {
  const fp = context.financialPerformance;
  if (fp.metrics.every((m) => m.values.length === 0)) {
    return `No annual financial statement history is available for this company. (Cite source ${fp.sourceId} only if you can state that data is unavailable; do not invent figures.)`;
  }

  const lines = fp.metrics.map((metric) => {
    const series = metric.values.map((v) => `FY${v.fiscalYear}: ${metric.changeKind === 'points' ? formatRatioAsPercent(v.value !== null ? v.value * 100 : null) : formatCompactCurrency(v.value)}`).join(', ');
    const change = metric.changeKind === 'points' ? formatRatioAsPercent(metric.latestYoyChange !== null ? metric.latestYoyChange * 100 : null) : formatRatioAsPercent(metric.latestYoyChange !== null ? metric.latestYoyChange * 100 : null);
    return `- ${metric.label}: ${series} (latest YoY change: ${change})`;
  });

  return [`(cite as source ${fp.sourceId})`, ...lines, fp.stale ? 'Note: financial data is a stale cached snapshot.' : null].filter((l): l is string => l !== null).join('\n');
}

function renderDcf(context: ResearchContext): string {
  if (!context.dcfAnalysis) return 'No DCF model could be run for this company (insufficient historical financial data).';
  const dcf = context.dcfAnalysis;
  return [
    `(cite as source ${dcf.sourceId})`,
    `Current share price: ${formatCompactCurrency(dcf.currentSharePrice)}`,
    `Forecast horizon: ${dcf.forecastYears} years`,
    ...dcf.scenarios.map(formatScenario),
  ].join('\n');
}

function renderComps(context: ResearchContext): string {
  if (!context.compsAnalysis) return 'No comparable-company peer set could be identified for this company.';
  const comps = context.compsAnalysis;
  const fmtMultiple = (v: number | null) => (v !== null ? `${v.toFixed(1)}x` : 'N/M');
  return [
    `(cite as source ${comps.sourceId})`,
    `Target multiples: EV/Revenue ${fmtMultiple(comps.targetMultiples.evToRevenue)}, EV/EBITDA ${fmtMultiple(comps.targetMultiples.evToEbitda)}, EV/EBIT ${fmtMultiple(comps.targetMultiples.evToEbit)}, P/E ${fmtMultiple(comps.targetMultiples.peRatio)}`,
    `Peer median multiples: EV/Revenue ${fmtMultiple(comps.peerMedianMultiples.evToRevenue)}, EV/EBITDA ${fmtMultiple(comps.peerMedianMultiples.evToEbitda)}, EV/EBIT ${fmtMultiple(comps.peerMedianMultiples.evToEbit)}, P/E ${fmtMultiple(comps.peerMedianMultiples.peRatio)}`,
    `Peers (${comps.peers.length}): ${comps.peers.map((p) => p.ticker).join(', ')}`,
    `Comps-implied share price: ${formatCompactCurrency(comps.impliedSharePrice)}`,
    `Upside/downside vs. current price: ${formatRatioAsPercent(comps.upsideDownside !== null ? comps.upsideDownside * 100 : null)}`,
  ].join('\n');
}

function renderSecFilingContext(context: ResearchContext): string {
  if (!context.secFilingContext) return 'No SEC filings are available for this company.';
  const sec = context.secFilingContext;
  const lines = [`(cite as source ${sec.sourceId})`, `Filing: ${sec.filing.formType}, filed ${sec.filing.filingDate.slice(0, 10)}`];

  if (!sec.analysis) {
    lines.push('No AI analysis has been generated for this filing yet — only the filing metadata above is available.');
    return lines.join('\n');
  }

  lines.push(`Summary: ${sec.analysis.summary}`);
  const keyChanges = truncateStringList(sec.analysis.keyChanges);
  if (keyChanges.length > 0) lines.push(`Key changes: ${keyChanges.join(' | ')}`);
  const risks = truncateDescriptionList(sec.analysis.risks);
  if (risks.length > 0) lines.push(`Risks: ${risks.map((r) => `[${r.category}] ${r.description}`).join(' | ')}`);
  const mgmt = truncateStringList(sec.analysis.managementCommentary);
  if (mgmt.length > 0) lines.push(`Management commentary: ${mgmt.join(' | ')}`);
  const capAlloc = truncateStringList(sec.analysis.capitalAllocation);
  if (capAlloc.length > 0) lines.push(`Capital allocation: ${capAlloc.join(' | ')}`);
  const acctChanges = truncateStringList(sec.analysis.accountingChanges);
  if (acctChanges.length > 0) lines.push(`Accounting changes: ${acctChanges.join(' | ')}`);

  return lines.join('\n');
}

function renderEarningsContext(context: ResearchContext): string {
  if (!context.earningsContext) return 'No earnings calls are available for this company.';
  const earnings = context.earningsContext;
  const lines = [`(cite as source ${earnings.sourceId})`, `Call: Q${earnings.call.fiscalQuarter} ${earnings.call.fiscalYear}${earnings.call.callDate ? ` (${earnings.call.callDate.slice(0, 10)})` : ''}`];

  if (earnings.guidance.length > 0) {
    const guidanceLines = earnings.guidance.map(
      (g) => `${g.metricLabel} (${g.period}): ${g.midpoint !== null ? g.midpoint.toLocaleString() : 'n/a'} midpoint, ${g.change}`,
    );
    lines.push(`Guidance: ${guidanceLines.join(' | ')}`);
  }

  if (!earnings.analysis) {
    lines.push('No AI analysis has been generated for this call yet — only the call metadata and guidance above is available.');
    return lines.join('\n');
  }

  lines.push(`Summary: ${earnings.analysis.summary}`);
  const trends = truncateDescriptionList(earnings.analysis.businessTrends);
  if (trends.length > 0) lines.push(`Business trends: ${trends.map((t) => `[${t.category}] ${t.description}`).join(' | ')}`);
  const risks = truncateDescriptionList(earnings.analysis.risks);
  if (risks.length > 0) lines.push(`Risks: ${risks.map((r) => `[${r.category}] ${r.description}`).join(' | ')}`);
  const capAlloc = truncateDescriptionList(earnings.analysis.capitalAllocation);
  if (capAlloc.length > 0) lines.push(`Capital allocation: ${capAlloc.map((c) => `[${c.category}] ${c.description}`).join(' | ')}`);
  if (earnings.analysis.managementLanguage.length > 0) {
    lines.push(
      `Management language (AI-based language analysis, not an objective measurement): ${earnings.analysis.managementLanguage
        .map((m) => `${m.dimension}=${m.level} (${m.observation})`)
        .join(' | ')}`,
    );
  }

  return lines.join('\n');
}

function renderSources(sources: ResearchSource[]): string {
  return sources.map((s) => `[${s.id}] ${s.label}${s.detail ? ` — ${s.detail}` : ''} (${s.type})`).join('\n');
}

export function buildResearchReportUserPrompt(context: ResearchContext): string {
  return [
    `# Company Overview`,
    renderCompanyOverview(context),
    '',
    `# Financial Performance (annual)`,
    renderFinancialPerformance(context),
    '',
    `# DCF Valuation`,
    renderDcf(context),
    '',
    `# Comparable Company Analysis`,
    renderComps(context),
    '',
    `# SEC Filing Insights`,
    renderSecFilingContext(context),
    '',
    `# Earnings Call Insights`,
    renderEarningsContext(context),
    '',
    `# AVAILABLE SOURCES (cite only these IDs)`,
    renderSources(context.sources),
    '',
    context.warnings.length > 0 ? `# Known data gaps for this research context\n${context.warnings.map((w) => `- ${w}`).join('\n')}` : '',
    '',
    'Synthesize the above into a structured research report and call the tool with your findings.',
  ].join('\n');
}
