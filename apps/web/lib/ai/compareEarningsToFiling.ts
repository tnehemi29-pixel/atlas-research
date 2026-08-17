import { buildEarningsFilingComparisonUserPrompt, EARNINGS_FILING_COMPARISON_SYSTEM_PROMPT } from './earningsPrompts';
import { runStructuredAnalysis } from './runStructuredAnalysis';
import {
  EARNINGS_FILING_COMPARISON_TOOL_SCHEMA,
  earningsFilingComparisonAiSchema,
  type EarningsFilingComparisonAiPayload,
} from './earningsSchema';
import { selectSegmentsForComparison, type TranscriptSegmentInput } from './earningsSectionSelection';
import { selectSectionsForComparison, type SectionInput } from './sectionSelection';

const TOOL_NAME = 'submit_earnings_filing_comparison';
const TOOL_DESCRIPTION = 'Submit the structured cross-source comparison between the earnings call and the SEC filing.';

export interface CompareEarningsToFilingParams {
  companyName: string;
  fiscalYear: number;
  fiscalQuarter: number;
  callSegments: TranscriptSegmentInput[];
  filingFormType: string;
  filingSections: SectionInput[];
}

export interface CompareEarningsToFilingResult {
  payload: EarningsFilingComparisonAiPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Cross-source research: compares an earnings call's commentary against its
 * corresponding SEC filing (reusing Milestone 7's filing-section selection
 * so the filing side gets the exact same budget/exclusion treatment filing
 * analysis does). Entirely AI-generated (there's no deterministic "financial
 * changes" half here — both sources are narrative), so the neutral-framing
 * rules in the prompt carry the full weight of avoiding an overclaimed
 * "contradiction."
 */
export async function compareEarningsToFiling(
  params: CompareEarningsToFilingParams,
): Promise<CompareEarningsToFilingResult> {
  const callSegments = selectSegmentsForComparison(params.callSegments);
  const filingSections = selectSectionsForComparison(params.filingSections);

  const user = buildEarningsFilingComparisonUserPrompt({
    companyName: params.companyName,
    fiscalYear: params.fiscalYear,
    fiscalQuarter: params.fiscalQuarter,
    callSegments,
    filingFormType: params.filingFormType,
    filingSections,
  });

  return runStructuredAnalysis<EarningsFilingComparisonAiPayload>({
    system: EARNINGS_FILING_COMPARISON_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: EARNINGS_FILING_COMPARISON_TOOL_SCHEMA,
    zodSchema: earningsFilingComparisonAiSchema,
  });
}
