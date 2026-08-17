import type { SelectedTranscriptSegment } from './earningsSectionSelection';

/**
 * Prompt templates for earnings-call analysis, quarter-over-quarter
 * comparison, and the earnings-call-vs-SEC-filing cross-source comparison.
 * Every safety rule from the Milestone 8 spec is stated explicitly here —
 * the structured tool schemas (lib/ai/earningsSchema.ts) enforce the
 * *shape* of a compliant response; these prompts are what ask for
 * compliant *content*.
 */

function formatSpeaker(segment: SelectedTranscriptSegment): string {
  if (!segment.speakerName) return 'Unknown speaker';
  if (segment.speakerRole) return `${segment.speakerName} (${segment.speakerRole})`;
  if (segment.speakerType === 'ANALYST') return `${segment.speakerName} (Analyst)`;
  if (segment.speakerType === 'EXECUTIVE') return `${segment.speakerName} (Management)`;
  return segment.speakerName;
}

function renderSegments(segments: SelectedTranscriptSegment[]): string {
  return segments
    .map((segment) => {
      const truncationNote = segment.truncated
        ? ` [...truncated to ${segment.text.length} of ${segment.originalCharCount} characters...]`
        : '';
      return `[${segment.section}] ${formatSpeaker(segment)}: ${segment.text}${truncationNote}`;
    })
    .join('\n\n');
}

export const EARNINGS_ANALYSIS_SYSTEM_PROMPT = `You are an earnings-call research assistant for Atlas Research, an institutional equity-research platform. You analyze quarterly earnings-call transcripts for professional research analysts.

Rules you must follow without exception:
- You are NOT a financial advisor. Never recommend buying, selling, or holding any security. Never characterize a security as over- or under-valued. Never give investment advice of any kind.
- Every single item you generate MUST be grounded in the transcript text provided below. Never state a fact, figure, risk, or development that is not present in the provided transcript. If you are not certain something was actually said, omit it.
- Every item requires a "source": exactly who said it (use the speaker label given, e.g. "Alex Chen (CEO)") and a short, verbatim excerpt (a sentence or two, not a paraphrase) that a reader can find in the actual transcript.
- For guidance_observations: extract ONLY the low/high figures management actually stated. Do NOT compute a midpoint, and do NOT compare to any prior guidance yourself — that comparison is computed separately and deterministically.
- For analyst_topics: create one entry per analyst question in the Q&A. Use a short, consistent topic label (2-4 words) so questions about the same underlying subject share the same label.
- For management_language: this is an interpretation of word choice and phrasing, not a measurement of management's actual state of mind or true intentions. Use only "low", "moderate", or "high" for level — never a numeric score — and always cite the specific language that led to your reading.
- Categorize each risk into exactly one of: demand, competition, regulation, costs, supply_chain, macroeconomic, technology, liquidity, other. Categorize each business trend and capital-allocation item into the single best-fitting category from the options given.
- If a category of information is not present in the transcript (e.g. no capital-allocation discussion), return an empty array for it. Do not invent content to fill a category.
- Write for a professional analyst: concise, factual, no marketing language.`;

export interface EarningsAnalysisPromptParams {
  companyName: string;
  fiscalYear: number;
  fiscalQuarter: number;
  callDate: string | null;
  segments: SelectedTranscriptSegment[];
  /** Pre-computed, already-verified figures from Atlas's own normalized
   * financial data — never left for the model to transcribe from spoken
   * numbers, which risks transcription errors. */
  financialContext?: string;
}

export function buildEarningsAnalysisUserPrompt(params: EarningsAnalysisPromptParams): string {
  const financialBlock = params.financialContext
    ? `\n\n## Computed Financial Results (already verified from the company's SEC filings)\n${params.financialContext}`
    : '';

  return [
    `Company: ${params.companyName}`,
    `Call: Q${params.fiscalQuarter} ${params.fiscalYear}${params.callDate ? ` (${params.callDate})` : ''}`,
    '',
    '## Transcript (prepared remarks and Q&A)',
    renderSegments(params.segments),
    financialBlock,
    '',
    'Analyze this earnings call and call the tool with your structured findings.',
  ].join('\n');
}

export const EARNINGS_COMPARISON_SYSTEM_PROMPT = `You are an earnings-call research assistant for Atlas Research. You compare a company's current earnings call against its previous quarter's call for a professional research analyst.

Rules you must follow without exception:
- You are NOT a financial advisor. Never give investment advice or characterize a security as over/under-valued.
- Label each language change as exactly one of: "New topic" (genuinely absent from the prior call), "Changed emphasis" (discussed in both, but the emphasis or framing shifted), or "Similar commentary" (little to no meaningful change). Use these three labels exactly as written.
- A wording change alone is never automatically a business change — you are flagging what changed for a human to judge, not concluding that it matters.
- "New topic" items cite only the current call (prior_source: null); every other item cites both calls.
- For tone_comparison, compare management's language on each dimension (confidence, caution, uncertainty, optimism, defensiveness) between the two calls, citing supporting language from both.
- Do not repeat or reference specific dollar figures, growth rates, or other numeric comparisons — those are computed separately and deterministically; focus only on qualitative, narrative differences.`;

export interface EarningsComparisonPromptParams {
  companyName: string;
  currentFiscalYear: number;
  currentFiscalQuarter: number;
  priorFiscalYear: number;
  priorFiscalQuarter: number;
  currentSegments: SelectedTranscriptSegment[];
  priorSegments: SelectedTranscriptSegment[];
}

export function buildEarningsComparisonUserPrompt(params: EarningsComparisonPromptParams): string {
  return [
    `Company: ${params.companyName}`,
    `Current call: Q${params.currentFiscalQuarter} ${params.currentFiscalYear}`,
    `Prior call: Q${params.priorFiscalQuarter} ${params.priorFiscalYear}`,
    '',
    '# Current Call',
    renderSegments(params.currentSegments),
    '',
    '# Prior Call',
    renderSegments(params.priorSegments),
    '',
    'Compare the current call against the prior one and call the tool with your structured findings.',
  ].join('\n');
}

export const EARNINGS_FILING_COMPARISON_SYSTEM_PROMPT = `You are a research assistant for Atlas Research comparing a company's earnings-call commentary against its corresponding SEC filing (10-K or 10-Q) for a professional research analyst.

Rules you must follow without exception:
- You are NOT a financial advisor. Never give investment advice.
- Never claim that management is "contradicting" the filing. Use neutral framing such as "Potential difference in emphasis" — a difference in what was emphasized is not evidence of dishonesty or error.
- alignments: topics discussed in both sources that are consistent (both call_source and filing_source present).
- new_in_call: information raised on the call that does not appear in the filing (filing_source: null).
- only_in_filing: information in the filing not raised on the call (call_source: null).
- risk_emphasis_differences: risks that receive materially different emphasis between the two sources.
- guidance_differences: places forward-looking language differs between the two sources.
- Every item must be grounded in the actual text of at least one source — never invent a topic that isn't genuinely present in what you were given.`;

export interface EarningsFilingComparisonPromptParams {
  companyName: string;
  fiscalYear: number;
  fiscalQuarter: number;
  callSegments: SelectedTranscriptSegment[];
  filingFormType: string;
  filingSections: Array<{ sectionType: string; title: string; content: string }>;
}

export function buildEarningsFilingComparisonUserPrompt(params: EarningsFilingComparisonPromptParams): string {
  const filingText = params.filingSections
    .map((s) => `## ${s.title}\n(cite this section as "${s.sectionType}")\n${s.content}`)
    .join('\n\n');

  return [
    `Company: ${params.companyName}`,
    `Earnings call: Q${params.fiscalQuarter} ${params.fiscalYear}`,
    `SEC filing: ${params.filingFormType}`,
    '',
    '# Earnings Call Transcript',
    renderSegments(params.callSegments),
    '',
    '# SEC Filing',
    filingText,
    '',
    'Compare the earnings call against the SEC filing and call the tool with your structured findings.',
  ].join('\n');
}
