/**
 * Search within a transcript — a plain case-insensitive substring search
 * over already-parsed segment text, with surrounding context for
 * highlighting. Same deliberately simple, deterministic, no-AI approach as
 * lib/sec/search.ts: a substring search is fast, free, and fully explainable.
 */

export interface SearchableSegment {
  section: string;
  speakerName: string | null;
  anchor: string;
  text: string;
}

export interface TranscriptSearchResult {
  section: string;
  speakerName: string | null;
  anchor: string;
  /** The snippet, pre-split around the match so the UI can highlight
   * `match` without re-running the search client-side. */
  before: string;
  match: string;
  after: string;
}

const CONTEXT_RADIUS = 120;
const MAX_RESULTS_PER_SEGMENT = 5;
const MAX_TOTAL_RESULTS = 50;

export function searchTranscript(segments: SearchableSegment[], rawQuery: string): TranscriptSearchResult[] {
  const query = rawQuery.trim();
  if (query.length === 0) return [];

  const lowerQuery = query.toLowerCase();
  const results: TranscriptSearchResult[] = [];

  for (const segment of segments) {
    const lowerText = segment.text.toLowerCase();
    let searchFrom = 0;
    let foundInSegment = 0;

    while (foundInSegment < MAX_RESULTS_PER_SEGMENT) {
      const matchIndex = lowerText.indexOf(lowerQuery, searchFrom);
      if (matchIndex === -1) break;

      results.push({
        section: segment.section,
        speakerName: segment.speakerName,
        anchor: segment.anchor,
        before: segment.text.slice(Math.max(0, matchIndex - CONTEXT_RADIUS), matchIndex),
        match: segment.text.slice(matchIndex, matchIndex + query.length),
        after: segment.text.slice(matchIndex + query.length, matchIndex + query.length + CONTEXT_RADIUS),
      });

      searchFrom = matchIndex + query.length;
      foundInSegment += 1;
      if (results.length >= MAX_TOTAL_RESULTS) return results;
    }
  }

  return results;
}
