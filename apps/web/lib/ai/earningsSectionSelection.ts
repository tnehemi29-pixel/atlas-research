/**
 * Decides which transcript segments actually go to the LLM, and how much of
 * each — "Transcripts can be long... implement chunking... never send the
 * entire transcript blindly in one request." A transcript is naturally
 * already broken into many small speaker turns (unlike a filing's monolithic
 * sections), so the budget here is enforced across segments rather than
 * within one giant block of text.
 */

export interface TranscriptSegmentInput {
  section: string;
  speakerName: string | null;
  speakerRole: string | null;
  speakerType: string;
  text: string;
  anchor: string;
}

export interface SelectedTranscriptSegment extends TranscriptSegmentInput {
  truncated: boolean;
  originalCharCount: number;
}

// The operator's call-opening ("Good day, and welcome...") is procedural
// boilerplate with no analytical value — excluded from every AI call to
// save budget, same reasoning M7 uses to exclude FINANCIAL_STATEMENTS text.
const ANALYTICAL_SECTIONS = new Set(['PREPARED_REMARKS', 'QA']);

export const MAX_CHARS_PER_SEGMENT = 4000;
export const MAX_TOTAL_CHARS_ANALYSIS = 45000;
export const MAX_TOTAL_CHARS_COMPARISON = 30000;

function selectWithBudget<T extends TranscriptSegmentInput>(
  segments: T[],
  maxPerSegment: number,
  maxTotal: number,
): SelectedTranscriptSegment[] {
  let budgetRemaining = maxTotal;
  const selected: SelectedTranscriptSegment[] = [];

  for (const segment of segments) {
    if (budgetRemaining <= 0) break;

    const cap = Math.min(maxPerSegment, budgetRemaining);
    const truncated = segment.text.length > cap;
    const text = truncated ? segment.text.slice(0, cap) : segment.text;

    selected.push({ ...segment, text, truncated, originalCharCount: segment.text.length });
    budgetRemaining -= text.length;
  }

  return selected;
}

export function selectSegmentsForAnalysis(segments: TranscriptSegmentInput[]): SelectedTranscriptSegment[] {
  const relevant = segments.filter((s) => ANALYTICAL_SECTIONS.has(s.section));
  return selectWithBudget(relevant, MAX_CHARS_PER_SEGMENT, MAX_TOTAL_CHARS_ANALYSIS);
}

export function selectSegmentsForComparison(segments: TranscriptSegmentInput[]): SelectedTranscriptSegment[] {
  const relevant = segments.filter((s) => ANALYTICAL_SECTIONS.has(s.section));
  return selectWithBudget(relevant, MAX_CHARS_PER_SEGMENT, MAX_TOTAL_CHARS_COMPARISON);
}
