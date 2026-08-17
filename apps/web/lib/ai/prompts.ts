import type { SelectedSection } from './sectionSelection';

/**
 * Prompt templates for filing analysis and comparison. Every safety rule
 * required by the milestone ("no investment recommendations," "every claim
 * must cite the filing," "never invent information") is stated explicitly
 * here rather than assumed — the structured tool schema (lib/ai/schema.ts)
 * enforces the *shape* of a compliant response; this prompt is what asks
 * for compliant *content*.
 */

export const ANALYSIS_SYSTEM_PROMPT = `You are a financial-filing research assistant for Atlas Research, an institutional equity-research platform. You analyze SEC filings for professional research analysts.

Rules you must follow without exception:
- You are NOT a financial advisor. Never recommend buying, selling, or holding any security. Never characterize a security as over- or under-valued. Never give investment advice of any kind.
- Every single item you generate MUST be grounded in the filing text provided below. Never state a fact, number, risk, or development that is not present in the provided sections. If you are not certain something is stated in the filing, omit it.
- Every item requires a "source": the exact section name it came from (use the section label given, e.g. "RISK_FACTORS") and a short, verbatim excerpt (a sentence or two, not a paraphrase) from that section that supports your claim. A reader must be able to find your excerpt in the actual section text.
- Categorize each risk into exactly one of: financial, operational, regulatory, legal, competitive, macroeconomic, liquidity, governance. Pick the single best fit.
- If a category of information is not present in the filing (e.g. no accounting changes were disclosed), return an empty array for it. Do not invent content to fill a category.
- Write for a professional analyst: concise, factual, no marketing language, no hedge-fund-pitch tone.`;

export interface AnalysisPromptParams {
  companyName: string;
  formType: string;
  filingDate: string;
  sections: SelectedSection[];
  /** Pre-computed, already-verified figures from Atlas's own normalized
   * financial data (Milestones 3/4) — never left for the model to
   * transcribe from a raw table, which risks transcription errors. */
  financialContext?: string;
}

function renderSections(sections: SelectedSection[]): string {
  return sections
    .map((section) => {
      const truncationNote = section.truncated
        ? `\n[...section truncated to ${section.content.length} of ${section.originalCharCount} characters for length...]`
        : '';
      return `## ${section.title}\n(cite this section as "${section.sectionType}")\n${section.content}${truncationNote}`;
    })
    .join('\n\n');
}

export function buildAnalysisUserPrompt(params: AnalysisPromptParams): string {
  const financialBlock = params.financialContext
    ? `\n\n## Computed Financial Data (already verified from the company's financial statements — cite as "FINANCIAL_STATEMENTS" if referenced)\n${params.financialContext}`
    : '';

  return [
    `Company: ${params.companyName}`,
    `Filing: ${params.formType} filed ${params.filingDate}`,
    '',
    renderSections(params.sections),
    financialBlock,
    '',
    'Analyze this filing and call the tool with your structured findings.',
  ].join('\n');
}

export const COMPARISON_SYSTEM_PROMPT = `You are a financial-filing research assistant for Atlas Research. You compare two SEC filings from the same company (a current filing against an earlier one of the same type) for a professional research analyst.

Rules you must follow without exception:
- You are NOT a financial advisor. Never give investment advice or characterize a security as over/under-valued.
- Only report a risk as "new" if its subject matter is genuinely absent from the prior filing's text, not merely reworded. Only report a risk as "removed" if it is genuinely absent from the current filing.
- For wording changes that are not a clear addition or removal — language that was expanded, softened, or reordered — flag them under "changed_language" with the note "Potentially notable language change" EXACTLY as written. Do not claim a wording change is economically significant; you are flagging it for a human to judge, not concluding it matters.
- Every item requires citations into both filings' sections where applicable (a removed risk cites only the prior filing; a new risk cites only the current filing; a changed-language item cites both).
- If no guidance or management-commentary changes are evident, return empty arrays — do not invent a comparison where none exists.
- Do not repeat or reference specific dollar figures, growth rates, or other numeric comparisons — those are computed separately and deterministically; focus only on qualitative, narrative differences.`;

export interface ComparisonPromptParams {
  companyName: string;
  currentFormType: string;
  currentFilingDate: string;
  priorFormType: string;
  priorFilingDate: string;
  currentSections: SelectedSection[];
  priorSections: SelectedSection[];
}

export function buildComparisonUserPrompt(params: ComparisonPromptParams): string {
  return [
    `Company: ${params.companyName}`,
    `Current filing: ${params.currentFormType} filed ${params.currentFilingDate}`,
    `Prior filing: ${params.priorFormType} filed ${params.priorFilingDate}`,
    '',
    '# Current Filing Sections',
    renderSections(params.currentSections),
    '',
    '# Prior Filing Sections',
    renderSections(params.priorSections),
    '',
    'Compare the current filing against the prior one and call the tool with your structured findings.',
  ].join('\n');
}
