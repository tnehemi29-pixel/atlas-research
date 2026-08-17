import type { FilingSectionTypeValue } from '@/lib/sec/sectionExtraction';

/**
 * Decides which extracted sections actually go to the LLM, and how much of
 * each — "Do NOT send an entire 10-K to an LLM unnecessarily" /
 * "section-based processing... chunking... only analyze sections necessary
 * for each research task." A 10-K's Risk Factors section alone can run
 * 50+ pages; this module is the one place that budget is enforced.
 */

export interface SectionInput {
  sectionType: FilingSectionTypeValue;
  title: string;
  content: string;
}

export interface SelectedSection extends SectionInput {
  /** True if `content` was cut short of the section's actual length. */
  truncated: boolean;
  originalCharCount: number;
}

// Full filing analysis reads the narrative sections. FINANCIAL_STATEMENTS
// is deliberately excluded — a dense table of numbers is far better (and
// cheaper) analyzed via Atlas's own already-normalized FinancialPeriod data
// (see lib/ai/analyzeFiling.ts's financial-context block) than by asking an
// LLM to transcribe figures out of raw table text.
const ANALYSIS_SECTION_TYPES: FilingSectionTypeValue[] = [
  'BUSINESS',
  'RISK_FACTORS',
  'MDA',
  'LIQUIDITY',
  'MARKET_RISK',
  'LEGAL_PROCEEDINGS',
  'CONTROLS_AND_PROCEDURES',
  'EIGHT_K_ITEM',
];

// A comparison only needs the sections whose language plausibly changes
// filing-to-filing — Business and Controls rarely do, and including them
// would double the token cost for little analytical value.
const COMPARISON_SECTION_TYPES: FilingSectionTypeValue[] = ['RISK_FACTORS', 'MDA', 'LIQUIDITY'];

// Documented cost-control budget: ~8,000 characters (~2,000 tokens) per
// section, ~40,000 characters (~10,000 tokens) total per analysis call.
export const MAX_CHARS_PER_SECTION = 8000;
export const MAX_TOTAL_CHARS = 40000;

function selectWithBudget(
  sections: SectionInput[],
  allowedTypes: FilingSectionTypeValue[],
  maxPerSection: number,
  maxTotal: number,
): SelectedSection[] {
  const relevant = sections.filter((section) => allowedTypes.includes(section.sectionType));

  let budgetRemaining = maxTotal;
  const selected: SelectedSection[] = [];

  for (const section of relevant) {
    if (budgetRemaining <= 0) break;

    const cap = Math.min(maxPerSection, budgetRemaining);
    const truncated = section.content.length > cap;
    const content = truncated ? section.content.slice(0, cap) : section.content;

    selected.push({ ...section, content, truncated, originalCharCount: section.content.length });
    budgetRemaining -= content.length;
  }

  return selected;
}

export function selectSectionsForAnalysis(sections: SectionInput[]): SelectedSection[] {
  return selectWithBudget(sections, ANALYSIS_SECTION_TYPES, MAX_CHARS_PER_SECTION, MAX_TOTAL_CHARS);
}

export function selectSectionsForComparison(sections: SectionInput[]): SelectedSection[] {
  return selectWithBudget(sections, COMPARISON_SECTION_TYPES, MAX_CHARS_PER_SECTION, MAX_TOTAL_CHARS);
}
