import { describe, expect, it } from 'vitest';
import {
  MAX_CHARS_PER_SEGMENT,
  MAX_TOTAL_CHARS_ANALYSIS,
  selectSegmentsForAnalysis,
  selectSegmentsForComparison,
} from './earningsSectionSelection';
import type { TranscriptSegmentInput } from './earningsSectionSelection';

function segment(section: string, length: number, speakerType = 'EXECUTIVE'): TranscriptSegmentInput {
  return {
    section,
    speakerName: 'Alex Chen',
    speakerRole: null,
    speakerType,
    text: 'x'.repeat(length),
    anchor: `segment-${section}`,
  };
}

describe('selectSegmentsForAnalysis', () => {
  it('excludes OPENING_REMARKS — procedural boilerplate with no analytical value', () => {
    const segments = [segment('OPENING_REMARKS', 50), segment('PREPARED_REMARKS', 50), segment('QA', 50)];
    const selected = selectSegmentsForAnalysis(segments);
    expect(selected.map((s) => s.section)).toEqual(['PREPARED_REMARKS', 'QA']);
  });

  it('does not truncate a segment within the per-segment budget', () => {
    const selected = selectSegmentsForAnalysis([segment('PREPARED_REMARKS', 100)]);
    expect(selected[0]?.truncated).toBe(false);
    expect(selected[0]?.text).toHaveLength(100);
  });

  it('truncates a single segment that exceeds the per-segment budget', () => {
    const selected = selectSegmentsForAnalysis([segment('PREPARED_REMARKS', MAX_CHARS_PER_SEGMENT + 1000)]);
    expect(selected[0]?.truncated).toBe(true);
    expect(selected[0]?.text).toHaveLength(MAX_CHARS_PER_SEGMENT);
    expect(selected[0]?.originalCharCount).toBe(MAX_CHARS_PER_SEGMENT + 1000);
  });

  it('enforces the total character budget across many segments', () => {
    const segments = Array.from({ length: 20 }, () => segment('QA', MAX_CHARS_PER_SEGMENT));
    const selected = selectSegmentsForAnalysis(segments);
    const totalChars = selected.reduce((sum, s) => sum + s.text.length, 0);
    expect(totalChars).toBeLessThanOrEqual(MAX_TOTAL_CHARS_ANALYSIS);
  });

  it('drops segments entirely once the total budget is exhausted, rather than sending an empty stub', () => {
    const segments = Array.from({ length: 20 }, () => segment('QA', MAX_CHARS_PER_SEGMENT));
    const selected = selectSegmentsForAnalysis(segments);
    expect(selected.length).toBeLessThan(segments.length);
  });
});

describe('selectSegmentsForComparison', () => {
  it('also excludes OPENING_REMARKS and uses a smaller total budget (two calls\' worth of text)', () => {
    const segments = [segment('OPENING_REMARKS', 50), segment('PREPARED_REMARKS', 50)];
    const selected = selectSegmentsForComparison(segments);
    expect(selected.map((s) => s.section)).toEqual(['PREPARED_REMARKS']);
  });
});
