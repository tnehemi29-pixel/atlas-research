/**
 * Search within a filing — a plain case-insensitive substring search over
 * already-extracted section text, with surrounding context for
 * highlighting. Deliberately simple and deterministic (no AI, no external
 * index): "search should return matching section, relevant text, filing
 * date, context" doesn't call for semantic search, and a substring search
 * is fast, free, and fully explainable.
 */

export interface SearchableSection {
  sectionType: string;
  title: string;
  anchor: string;
  content: string;
}

export interface FilingSearchResult {
  sectionType: string;
  sectionTitle: string;
  anchor: string;
  /** The snippet, pre-split around the match so the UI can highlight
   * `match` without re-running the search client-side. */
  before: string;
  match: string;
  after: string;
}

const CONTEXT_RADIUS = 120;
const MAX_RESULTS_PER_SECTION = 5;
const MAX_TOTAL_RESULTS = 50;

export function searchSections(sections: SearchableSection[], rawQuery: string): FilingSearchResult[] {
  const query = rawQuery.trim();
  if (query.length === 0) return [];

  const lowerQuery = query.toLowerCase();
  const results: FilingSearchResult[] = [];

  for (const section of sections) {
    const lowerContent = section.content.toLowerCase();
    let searchFrom = 0;
    let foundInSection = 0;

    while (foundInSection < MAX_RESULTS_PER_SECTION) {
      const matchIndex = lowerContent.indexOf(lowerQuery, searchFrom);
      if (matchIndex === -1) break;

      results.push({
        sectionType: section.sectionType,
        sectionTitle: section.title,
        anchor: section.anchor,
        before: section.content.slice(Math.max(0, matchIndex - CONTEXT_RADIUS), matchIndex),
        match: section.content.slice(matchIndex, matchIndex + query.length),
        after: section.content.slice(matchIndex + query.length, matchIndex + query.length + CONTEXT_RADIUS),
      });

      searchFrom = matchIndex + query.length;
      foundInSection += 1;
      if (results.length >= MAX_TOTAL_RESULTS) return results;
    }
  }

  return results;
}
