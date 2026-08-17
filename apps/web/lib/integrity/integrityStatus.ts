/**
 * Milestone 14 spec section 18 — every company's overall research-integrity
 * status, always paired with the specific, plain-language reasons it was
 * assigned. Mirrors Milestone 13's ThesisHealth discipline exactly: every
 * input here is a simple, explainable count (never a weighted/blended
 * score), so "why REVIEW_REQUIRED" is always answerable by reading
 * `reasons` back to the user verbatim — spec: "Do NOT collapse everything
 * into one unexplained score."
 */

export type ResearchIntegrityStatusValue = 'VERIFIED' | 'MINOR_ISSUES' | 'REVIEW_REQUIRED' | 'SIGNIFICANT_ISSUES' | 'CRITICAL';

export interface IntegrityStatusInput {
  criticalFindingCount: number;
  highFindingCount: number;
  mediumFindingCount: number;
  lowFindingCount: number;
  staleDatasetCount: number;
}

export interface IntegrityStatusResult {
  status: ResearchIntegrityStatusValue;
  reasons: string[];
}

export function computeIntegrityStatus(input: IntegrityStatusInput): IntegrityStatusResult {
  const reasons: string[] = [];

  if (input.criticalFindingCount > 0) reasons.push(`${input.criticalFindingCount} critical finding(s) require immediate review.`);
  if (input.highFindingCount > 0) reasons.push(`${input.highFindingCount} high-severity finding(s) detected.`);
  if (input.mediumFindingCount > 0) reasons.push(`${input.mediumFindingCount} medium-severity finding(s) detected.`);
  if (input.staleDatasetCount > 0) reasons.push(`${input.staleDatasetCount} dataset(s) are stale and may not reflect current information.`);
  if (input.lowFindingCount > 0) reasons.push(`${input.lowFindingCount} low-severity finding(s) detected.`);

  let status: ResearchIntegrityStatusValue;
  if (input.criticalFindingCount > 0) {
    status = 'CRITICAL';
  } else if (input.highFindingCount > 0) {
    status = 'SIGNIFICANT_ISSUES';
  } else if (input.mediumFindingCount > 0 || input.staleDatasetCount > 0) {
    status = 'REVIEW_REQUIRED';
  } else if (input.lowFindingCount > 0) {
    status = 'MINOR_ISSUES';
  } else {
    status = 'VERIFIED';
    reasons.push('No open findings across financial data, market data, models, or research for this company.');
  }

  return { status, reasons };
}
