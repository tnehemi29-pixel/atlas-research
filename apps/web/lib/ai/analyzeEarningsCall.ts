import { EARNINGS_ANALYSIS_SYSTEM_PROMPT, buildEarningsAnalysisUserPrompt } from './earningsPrompts';
import { runStructuredAnalysis } from './runStructuredAnalysis';
import { EARNINGS_ANALYSIS_TOOL_SCHEMA, earningsAnalysisSchema, type EarningsAnalysisPayload } from './earningsSchema';
import { selectSegmentsForAnalysis, type TranscriptSegmentInput } from './earningsSectionSelection';

const TOOL_NAME = 'submit_earnings_call_analysis';
const TOOL_DESCRIPTION = 'Submit the structured analysis of this earnings call.';

export interface AnalyzeEarningsCallParams {
  companyName: string;
  fiscalYear: number;
  fiscalQuarter: number;
  callDate: string | null;
  segments: TranscriptSegmentInput[];
  /** Pre-computed figures from Atlas's own normalized financial data — see
   * lib/services/earningsCallService.ts for how this is built. */
  financialContext?: string;
}

export interface AnalyzeEarningsCallResult {
  payload: EarningsAnalysisPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Runs the full earnings-call AI analysis: executive summary, business
 * trends, management commentary, guidance candidates, risks, capital
 * allocation, analyst-topic clustering, and management-language analysis.
 * Only ever called on-demand (see earningsCallService's caching) — never
 * automatically when a call is merely viewed.
 */
export async function analyzeEarningsCall(params: AnalyzeEarningsCallParams): Promise<AnalyzeEarningsCallResult> {
  const selectedSegments = selectSegmentsForAnalysis(params.segments);
  const user = buildEarningsAnalysisUserPrompt({
    companyName: params.companyName,
    fiscalYear: params.fiscalYear,
    fiscalQuarter: params.fiscalQuarter,
    callDate: params.callDate,
    segments: selectedSegments,
    financialContext: params.financialContext,
  });

  return runStructuredAnalysis<EarningsAnalysisPayload>({
    system: EARNINGS_ANALYSIS_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: EARNINGS_ANALYSIS_TOOL_SCHEMA,
    zodSchema: earningsAnalysisSchema,
  });
}
