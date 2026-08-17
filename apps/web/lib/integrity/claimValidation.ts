/**
 * Milestone 14 spec sections 13-14 — AI output validation and the research
 * claim registry's own validation step. The LLM is never treated as a source
 * of truth: every numeric claim is checked against the actual source value
 * it's supposed to be describing, and every citation is checked against a
 * real, known-valid set of source ids (collected the same backend-verified
 * way Milestone 9's `sanitizeReportPayload` and Milestone 13's
 * `collectValidCitationIds` already do). A claim that fails either check is
 * REJECTED — Atlas never silently rewrites or "fixes" a wrong number itself.
 */

export type NumericClaimStatus = 'VERIFIED' | 'REJECTED' | 'UNVERIFIED';

export interface NumericClaimCheck {
  status: NumericClaimStatus;
  differenceAbsolute: number | null;
  differencePercent: number | null;
  detail: string;
}

// Ratio-shaped claims (growth rates, margins) default to a tight absolute
// floor in percentage points — "18% vs. 11%" (7 points apart) must never
// pass regardless of the relative-tolerance term. Dollar-magnitude claims
// should pass a larger floor explicitly (see validateResearchClaim's own
// caller in reportAudit-style code).
export const DEFAULT_CLAIM_TOLERANCE_PERCENT = 0.05;
export const DEFAULT_CLAIM_TOLERANCE_ABSOLUTE_FLOOR = 0.01;

export function validateClaimNumber(
  statedValue: number | null,
  sourceValue: number | null,
  tolerancePercent: number = DEFAULT_CLAIM_TOLERANCE_PERCENT,
  toleranceAbsoluteFloor: number = DEFAULT_CLAIM_TOLERANCE_ABSOLUTE_FLOOR,
): NumericClaimCheck {
  if (statedValue === null || sourceValue === null) {
    return { status: 'UNVERIFIED', differenceAbsolute: null, differencePercent: null, detail: 'Cannot verify — the claim or its source value is unavailable.' };
  }

  const differenceAbsolute = statedValue - sourceValue;
  const differencePercent = sourceValue !== 0 ? Math.abs(differenceAbsolute) / Math.abs(sourceValue) : null;
  const allowed = Math.max(Math.abs(sourceValue) * tolerancePercent, toleranceAbsoluteFloor);
  const passed = Math.abs(differenceAbsolute) <= allowed;

  return {
    status: passed ? 'VERIFIED' : 'REJECTED',
    differenceAbsolute,
    differencePercent,
    detail: passed
      ? `Claimed value (${statedValue}) matches the source value (${sourceValue}) within tolerance.`
      : `Claimed value (${statedValue}) disagrees with the source value (${sourceValue}) by ${differenceAbsolute > 0 ? '+' : ''}${differenceAbsolute}.`,
  };
}

/** `validSourceIds: null` means "no registry to check against" (skip the
 * citation check entirely, e.g. a claim with no numeric citation attached);
 * an empty Set is a real, checkable registry that simply contains nothing
 * yet — a cited id against an empty set is correctly REJECTED. */
export function validateClaimCitation(citedSourceId: string | null, validSourceIds: ReadonlySet<string> | null): boolean | null {
  if (citedSourceId === null || validSourceIds === null) return null;
  return validSourceIds.has(citedSourceId);
}

export type ClaimValidationOutcomeStatus = 'VERIFIED' | 'UNVERIFIED' | 'REJECTED';

export interface ClaimValidationOutcome {
  status: ClaimValidationOutcomeStatus;
  detail: string;
  numeric: NumericClaimCheck;
  citationValid: boolean | null;
}

export interface ValidateResearchClaimInput {
  statedValue: number | null;
  sourceValue: number | null;
  citedSourceId: string | null;
  validSourceIds: ReadonlySet<string> | null;
  tolerancePercent?: number;
  toleranceAbsoluteFloor?: number;
}

/** The one function that decides a claim's overall validation outcome — an
 * invalid citation always rejects a claim outright, regardless of whether
 * its number happens to check out (an unverifiable source is disqualifying
 * on its own). */
export function validateResearchClaim(input: ValidateResearchClaimInput): ClaimValidationOutcome {
  const numeric = validateClaimNumber(input.statedValue, input.sourceValue, input.tolerancePercent, input.toleranceAbsoluteFloor);
  const citationValid = validateClaimCitation(input.citedSourceId, input.validSourceIds);

  if (citationValid === false) {
    return { status: 'REJECTED', detail: 'Claim rejected: the cited source could not be verified against a real Atlas record.', numeric, citationValid };
  }
  if (numeric.status === 'REJECTED') {
    return { status: 'REJECTED', detail: `Claim rejected: ${numeric.detail}`, numeric, citationValid };
  }
  if (numeric.status === 'UNVERIFIED' || citationValid === null) {
    return { status: 'UNVERIFIED', detail: 'Claim could not be fully verified against source data or a citation.', numeric, citationValid };
  }
  return { status: 'VERIFIED', detail: 'Claim verified against source data and a valid citation.', numeric, citationValid };
}
