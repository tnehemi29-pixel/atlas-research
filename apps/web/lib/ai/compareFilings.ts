import { buildComparisonUserPrompt, COMPARISON_SYSTEM_PROMPT } from './prompts';
import { runStructuredAnalysis } from './runStructuredAnalysis';
import { FILING_COMPARISON_TOOL_SCHEMA, filingComparisonAiSchema, type FilingComparisonAiPayload } from './schema';
import { selectSectionsForComparison, type SectionInput } from './sectionSelection';

const TOOL_NAME = 'submit_filing_comparison';
const TOOL_DESCRIPTION = 'Submit the structured qualitative comparison between the two filings.';

export interface CompareFilingsParams {
  companyName: string;
  currentFormType: string;
  currentFilingDate: string;
  priorFormType: string;
  priorFilingDate: string;
  currentSections: SectionInput[];
  priorSections: SectionInput[];
}

export interface CompareFilingsResult {
  payload: FilingComparisonAiPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Runs only the AI-generated *qualitative* half of a filing comparison
 * (new/removed risks, notable language changes, guidance/commentary
 * changes). Financial changes are computed separately and deterministically
 * — see lib/sec/financialChanges.ts — and combined with this result by
 * secFilingService.compareFilings.
 */
export async function compareFilings(params: CompareFilingsParams): Promise<CompareFilingsResult> {
  const currentSections = selectSectionsForComparison(params.currentSections);
  const priorSections = selectSectionsForComparison(params.priorSections);

  const user = buildComparisonUserPrompt({
    companyName: params.companyName,
    currentFormType: params.currentFormType,
    currentFilingDate: params.currentFilingDate,
    priorFormType: params.priorFormType,
    priorFilingDate: params.priorFilingDate,
    currentSections,
    priorSections,
  });

  return runStructuredAnalysis<FilingComparisonAiPayload>({
    system: COMPARISON_SYSTEM_PROMPT,
    user,
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolSchema: FILING_COMPARISON_TOOL_SCHEMA,
    zodSchema: filingComparisonAiSchema,
  });
}
