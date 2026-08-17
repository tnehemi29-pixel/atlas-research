import { describe, expect, it } from 'vitest';
import { searchTranscript } from './search';
import type { SearchableSegment } from './search';

function segment(overrides: Partial<SearchableSegment> = {}): SearchableSegment {
  return {
    section: 'QA',
    speakerName: 'Alex Chen',
    anchor: 'segment-5',
    text: 'We are seeing strong demand across all regions, particularly in the enterprise segment.',
    ...overrides,
  };
}

describe('searchTranscript', () => {
  it('finds a case-insensitive match and splits the snippet around it', () => {
    const results = searchTranscript([segment()], 'DEMAND');
    expect(results).toHaveLength(1);
    expect(results[0]?.match).toBe('demand'); // preserves original casing from the source text
    expect(results[0]?.speakerName).toBe('Alex Chen');
    expect(results[0]?.before).toContain('seeing strong');
    expect(results[0]?.after).toContain('across all regions');
  });

  it('returns an empty array for an empty or whitespace-only query', () => {
    expect(searchTranscript([segment()], '')).toEqual([]);
    expect(searchTranscript([segment()], '   ')).toEqual([]);
  });

  it('returns no results when nothing matches', () => {
    expect(searchTranscript([segment()], 'nonexistent phrase')).toEqual([]);
  });

  it('finds multiple matches within the same segment', () => {
    const results = searchTranscript(
      [segment({ text: 'Margins improved. Margins are strong. Margins should hold.' })],
      'margins',
    );
    expect(results).toHaveLength(3);
  });

  it('finds matches across multiple segments and preserves speaker/section identity', () => {
    const segments = [
      segment({ section: 'PREPARED_REMARKS', speakerName: 'Alex Chen', text: 'CapEx guidance is unchanged.' }),
      segment({ section: 'QA', speakerName: 'Priya Natarajan', text: 'Our CapEx plan reflects AI investment.' }),
    ];
    const results = searchTranscript(segments, 'capex');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.speakerName)).toEqual(['Alex Chen', 'Priya Natarajan']);
  });

  it('caps the number of matches returned per segment', () => {
    const repeated = 'word '.repeat(20);
    const results = searchTranscript([segment({ text: repeated })], 'word');
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
