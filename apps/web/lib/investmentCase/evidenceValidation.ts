import type { EvidenceSourceType } from '@prisma/client';

/**
 * Spec sections 8 and 9 — "Never allow unsupported AI-generated evidence."
 * This is the ONE gate every evidence item passes through before it's ever
 * persisted, regardless of whether a human filled out the evidence form or
 * the AI thesis assistant proposed it — there is no separate, less-checked
 * write path for AI-originated content anywhere in this milestone (see
 * lib/services/investmentCaseEvidenceService.ts, the only caller of
 * `validateEvidenceSource`).
 *
 * Kept pure and DB-free on purpose: the actual "does this row exist and
 * belong to this company" lookup happens in the service layer, which then
 * passes the result in as `resolution` — this file only encodes the RULE
 * ("a row-backed source type must resolve to a real, company-scoped row"),
 * so the rule itself is unit-testable without a database.
 */

const ROW_BACKED_FIELD: Record<EvidenceSourceType, 'secFilingId' | 'earningsCallId' | 'researchEventId' | null> = {
  TEN_K: 'secFilingId',
  TEN_Q: 'secFilingId',
  EIGHT_K: 'secFilingId',
  EARNINGS_CALL: 'earningsCallId',
  RESEARCH_EVENT: 'researchEventId',
  FINANCIAL_STATEMENT: null,
  DCF: null,
  COMPS: null,
  HISTORICAL_VALIDATION: null,
};

/** Which foreign-key field a given source type requires, or null when the
 * source type has no single persisted row to point at (Financial Statement/
 * DCF/Comps/Historical Validation are all computed, not stored rows). */
export function requiredRowField(sourceType: EvidenceSourceType): 'secFilingId' | 'earningsCallId' | 'researchEventId' | null {
  return ROW_BACKED_FIELD[sourceType];
}

export interface EvidenceSourceCandidate {
  sourceType: EvidenceSourceType;
  sourceLabel: string;
  secFilingId: string | null;
  earningsCallId: string | null;
  researchEventId: string | null;
}

export interface RowBackedSourceResolution {
  exists: boolean;
  belongsToCompany: boolean;
}

export interface EvidenceValidationResult {
  valid: boolean;
  reason: string | null;
}

/** `resolution` should be the result of actually looking up the referenced
 * row (and confirming it belongs to the case's own company) — pass `null`
 * only when the source type isn't row-backed, in which case it's ignored. */
export function validateEvidenceSource(candidate: EvidenceSourceCandidate, resolution: RowBackedSourceResolution | null): EvidenceValidationResult {
  if (!candidate.sourceLabel || candidate.sourceLabel.trim().length === 0) {
    return { valid: false, reason: 'Evidence must include a human-readable source label.' };
  }

  const requiredField = requiredRowField(candidate.sourceType);
  if (requiredField === null) {
    return { valid: true, reason: null };
  }

  const providedId = candidate[requiredField];
  if (!providedId) {
    return { valid: false, reason: `Evidence sourced from ${candidate.sourceType} must reference a real ${requiredField}.` };
  }
  if (!resolution) {
    return { valid: false, reason: 'Could not verify the referenced source exists.' };
  }
  if (!resolution.exists) {
    return { valid: false, reason: 'The referenced source does not exist.' };
  }
  if (!resolution.belongsToCompany) {
    return { valid: false, reason: "The referenced source does not belong to this investment case's company." };
  }
  return { valid: true, reason: null };
}
