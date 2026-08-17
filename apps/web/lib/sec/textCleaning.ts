/**
 * Cleans a section's joined block text for storage/display/AI input.
 * Deliberately conservative: it only removes whole lines matching a narrow,
 * specific set of known-boilerplate patterns (a bare page number, a
 * standalone "Table of Contents" line) and normalizes whitespace — it never
 * rewrites, reformats, or touches the content of a line that survives.
 * Financial figures, dates, and section titles are never altered, only
 * whitespace-normalized around them.
 */

// A line that is JUST a number (a page number left over from a paginated
// layout) — not a dollar figure or a number embedded in a sentence, which
// always have surrounding text on the same line.
const PAGE_NUMBER_LINE = /^\d{1,4}$/;

const BOILERPLATE_LINES: RegExp[] = [
  /^table of contents$/i,
  /^\(this page intentionally left blank\.?\)$/i,
];

export function cleanSectionText(rawText: string): string {
  const lines = rawText.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());

  const kept = lines.filter((line) => {
    if (line.length === 0) return true; // blank lines preserved as paragraph breaks, collapsed below
    if (PAGE_NUMBER_LINE.test(line)) return false;
    if (BOILERPLATE_LINES.some((pattern) => pattern.test(line))) return false;
    return true;
  });

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ consecutive blank lines to a single paragraph break
    .trim();
}
