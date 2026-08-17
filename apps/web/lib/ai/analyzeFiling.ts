import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from './prompts';
import { runStructuredAnalysis } from './runStructuredAnalysis';
import { FILING_ANALYSIS_TOOL_SCHEMA, filingAnalysisSchema, type FilingAnalysisPayload } from './schema';
import { selectSectionsForAnalysis, type SectionInput } from './sectionSelection';

const TOOL_NAME = 'submit_filing_analysis';
const TOOL_DESCRIPTION = 'Submit the structured analysis of this SEC filing.';

export interface AnalyzeFilingParams {
  companyName: string;
  formType: string;
  filingDate: string;
  sections: SectionInput[];
  /** Pre-computed figures from Atlas's own normalized financial data — see
   * lib/services/secFilingService.ts for how this is built. */
  financialContext?: string;
}

export interface AnalyzeFilingResult {
  payload: FilingAnalysisPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Runs the full-filing AI analysis: executive summary, key changes, risk
 * flags, management commentary, capital allocation, accounting changes.
 * Only ever called on-demand (see secFilingService.analyzeFiling's caching)
 * — never automatically when a filing is merely viewed.
 */
export async function analyzeFiling(params: AnalyzeFilingParams): Promise<AnalyzeFilingResult> {
  const selectedSections = selectSectionsForAnalysis(params.sections);
  const user = buildAnalysisUserPrompt({
    companyName: params.companyName,
    formType: params.formType,
    filingDate: params.filingDate,
    sections: selectedSections,
    financialContext: params.financialContext,
  });

  return runStructuredAnalysis<FilingAnalysisPayload>({
    system: ANALYSIS_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: FILING_ANALYSIS_TOOL_SCHEMA,
    zodSchema: filingAnalysisSchema,
  });
}
