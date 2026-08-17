import { buildEarningsComparisonUserPrompt, EARNINGS_COMPARISON_SYSTEM_PROMPT } from './earningsPrompts';
import { runStructuredAnalysis } from './runStructuredAnalysis';
import { EARNINGS_COMPARISON_TOOL_SCHEMA, earningsComparisonAiSchema, type EarningsComparisonAiPayload } from './earningsSchema';
import { selectSegmentsForComparison, type TranscriptSegmentInput } from './earningsSectionSelection';

const TOOL_NAME = 'submit_earnings_comparison';
const TOOL_DESCRIPTION = 'Submit the structured qualitative comparison between the two earnings calls.';

export interface CompareEarningsCallsParams {
  companyName: string;
  currentFiscalYear: number;
  currentFiscalQuarter: number;
  priorFiscalYear: number;
  priorFiscalQuarter: number;
  currentSegments: TranscriptSegmentInput[];
  priorSegments: TranscriptSegmentInput[];
}

export interface CompareEarningsCallsResult {
  payload: EarningsComparisonAiPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Runs only the AI-generated *qualitative* half of an earnings-call
 * comparison (language changes, tone comparison). Financial results are
 * computed separately and deterministically — see lib/earnings/financialResults.ts
 * and lib/earnings/guidance.ts — and combined with this result by
 * earningsCallService.compareEarningsCalls.
 */
export async function compareEarningsCalls(params: CompareEarningsCallsParams): Promise<CompareEarningsCallsResult> {
  const currentSegments = selectSegmentsForComparison(params.currentSegments);
  const priorSegments = selectSegmentsForComparison(params.priorSegments);

  const user = buildEarningsComparisonUserPrompt({
    companyName: params.companyName,
    currentFiscalYear: params.currentFiscalYear,
    currentFiscalQuarter: params.currentFiscalQuarter,
    priorFiscalYear: params.priorFiscalYear,
    priorFiscalQuarter: params.priorFiscalQuarter,
    currentSegments,
    priorSegments,
  });

  return runStructuredAnalysis<EarningsComparisonAiPayload>({
    system: EARNINGS_COMPARISON_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: EARNINGS_COMPARISON_TOOL_SCHEMA,
    zodSchema: earningsComparisonAiSchema,
  });
}
