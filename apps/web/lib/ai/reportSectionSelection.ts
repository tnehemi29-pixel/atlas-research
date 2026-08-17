/**
 * Cost-control layer for the research-report prompt. Unlike Milestones 7/8
 * (which truncate raw filing/transcript text), the context fed here is
 * already-synthesized analysis (M7's FilingAnalysis, M8's EarningsAnalysis)
 * — much smaller to start with — so the budget only needs to cap how many
 * list items and how long each item's text can be, not chunk a large document.
 */

export const MAX_LIST_ITEMS = 12;
export const MAX_CHARS_PER_ITEM = 400;

export function truncateText(text: string, maxChars: number = MAX_CHARS_PER_ITEM): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

/** Truncates a plain string list to at most `maxItems`, each capped at `maxCharsEach`. */
export function truncateStringList(items: string[], maxItems: number = MAX_LIST_ITEMS, maxCharsEach: number = MAX_CHARS_PER_ITEM): string[] {
  return items.slice(0, maxItems).map((item) => truncateText(item, maxCharsEach).text);
}

/** Same budget, for a list of objects with a `description` field (risks,
 * business trends, etc.) — every other field on each item passes through unchanged. */
export function truncateDescriptionList<T extends { description: string }>(
  items: T[],
  maxItems: number = MAX_LIST_ITEMS,
  maxCharsEach: number = MAX_CHARS_PER_ITEM,
): T[] {
  return items.slice(0, maxItems).map((item) => ({ ...item, description: truncateText(item.description, maxCharsEach).text }));
}
