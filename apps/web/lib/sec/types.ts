/**
 * Shared string-union types for lib/sec/ — deliberately independent of
 * @prisma/client (the same pattern lib/xbrl/types.ts uses) so this layer
 * stays a plain, Prisma-agnostic calculation/processing module. The values
 * match the Prisma enums of the same name exactly; secFilingService.ts is
 * the boundary that converts between the two.
 */

export type SecFilingTypeValue = 'TEN_K' | 'TEN_Q' | 'EIGHT_K' | 'DEF_14A' | 'TWENTY_F' | 'OTHER';

export type FilingProcessingStatusValue = 'PENDING' | 'FETCHING' | 'EXTRACTING' | 'COMPLETE' | 'FAILED';

export type ImportanceLevel = 'High' | 'Medium' | 'Low';

/** Maps a raw SEC form label (e.g. "10-K", "10-K/A", "8-K") to Atlas's
 * supported filing-type bucket. Amendments (the "/A" suffix) are bucketed
 * with their base form — an amended 10-K is still fundamentally a 10-K. */
export function classifyFormType(formType: string): SecFilingTypeValue {
  const normalized = formType.trim().toUpperCase().replace(/\/A$/, '');
  switch (normalized) {
    case '10-K':
    case '10-KSB':
      return 'TEN_K';
    case '10-Q':
    case '10-QSB':
      return 'TEN_Q';
    case '8-K':
      return 'EIGHT_K';
    case 'DEF 14A':
      return 'DEF_14A';
    case '20-F':
      return 'TWENTY_F';
    default:
      return 'OTHER';
  }
}

/** Parses SEC's comma-separated 8-K item-codes string (e.g. "2.02,9.01")
 * into a clean array — null/empty (non-8-K filings, or an 8-K with no
 * items parsed yet) becomes an empty array, never a crash. */
export function parseItemCodes(items: string | null): string[] {
  if (!items) return [];
  return items
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
}
