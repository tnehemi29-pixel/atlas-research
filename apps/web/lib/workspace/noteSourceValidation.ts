/**
 * Milestone 15 spec section 7 — "The source must be an existing Atlas
 * source. Do not allow fake source IDs." Mirrors lib/integrity/
 * claimValidation.ts's validateClaimCitation exactly (NoteSource uses the
 * same loose sourceType/sourceId shape as Milestone 14's ClaimSource, not
 * InvestmentCaseEvidence's typed-column shape) — kept pure and DB-free; the
 * actual "does this row exist" lookup happens in researchNoteService.ts,
 * which passes the boolean result in as `exists`.
 */

export const NOTE_SOURCE_TYPES = [
  'TEN_K',
  'TEN_Q',
  'EIGHT_K',
  'EARNINGS_CALL',
  'RESEARCH_EVENT',
  'RESEARCH_REPORT',
  'INVESTMENT_CASE',
  'FINANCIAL_STATEMENT',
  'DCF_ASSUMPTION',
  'OTHER',
] as const;

export type NoteSourceType = (typeof NOTE_SOURCE_TYPES)[number];

// Row-backed types must resolve to a real, existing record. The remaining
// types (financial statements, DCF assumptions, a general "other") have no
// single persisted row to point at — a human-readable label is all that's
// required, the same distinction Milestone 13's evidence validation draws.
const ROW_BACKED_TYPES = new Set<NoteSourceType>(['TEN_K', 'TEN_Q', 'EIGHT_K', 'EARNINGS_CALL', 'RESEARCH_EVENT', 'RESEARCH_REPORT', 'INVESTMENT_CASE']);

export function isRowBackedSourceType(sourceType: NoteSourceType): boolean {
  return ROW_BACKED_TYPES.has(sourceType);
}

export interface NoteSourceCandidate {
  sourceType: NoteSourceType;
  sourceId: string | null;
  sourceLabel: string;
}

export interface NoteSourceValidationResult {
  valid: boolean;
  reason: string | null;
}

/** `exists` should be the result of an actual lookup for a row-backed
 * source type (and, where the source type is company-scoped, that it
 * belongs to the note's own company) — pass `null` only when the source
 * type isn't row-backed, in which case it's ignored. */
export function validateNoteSource(candidate: NoteSourceCandidate, exists: boolean | null): NoteSourceValidationResult {
  if (!candidate.sourceLabel || candidate.sourceLabel.trim().length === 0) {
    return { valid: false, reason: 'A source must include a human-readable label.' };
  }

  if (!isRowBackedSourceType(candidate.sourceType)) {
    return { valid: true, reason: null };
  }

  if (!candidate.sourceId) {
    return { valid: false, reason: `A ${candidate.sourceType} source must reference a real record id.` };
  }
  if (exists === null) {
    return { valid: false, reason: 'Could not verify the referenced source exists.' };
  }
  if (!exists) {
    return { valid: false, reason: 'The referenced source does not exist in Atlas.' };
  }
  return { valid: true, reason: null };
}
