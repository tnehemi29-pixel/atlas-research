/**
 * Spec section 13 — a structured thesis-health framework. The status is
 * always accompanied by the specific, documented reasons it was assigned
 * (`reasons`) — never a bare label, never a hidden scoring formula. Every
 * input here is itself already a plain, explainable count (never a
 * weighted/blended score), so "why STABLE" or "why CHALLENGED" is always
 * answerable by reading the `reasons` array back to the user verbatim.
 */

export type ThesisHealthStatus = 'STABLE' | 'WATCH' | 'CHALLENGED' | 'REVIEW_REQUIRED';

export interface ThesisHealthInput {
  challengeCount: number;
  potentiallyMetInvalidationCount: number;
  highImpactOpenRiskCount: number;
  failedCatalystCount: number;
  /** Null when no review has ever been completed for this case. */
  daysSinceLastReview: number | null;
  /** How many days before a case is considered overdue for review — a
   * plain, caller-supplied number (e.g. ~1 quarter), never hardcoded here. */
  reviewOverdueDays: number;
}

export interface ThesisHealthResult {
  status: ThesisHealthStatus;
  reasons: string[];
}

export function computeThesisHealth(input: ThesisHealthInput): ThesisHealthResult {
  const reasons: string[] = [];

  if (input.potentiallyMetInvalidationCount > 0) {
    reasons.push(`${input.potentiallyMetInvalidationCount} invalidation criterion/criteria potentially met — requires review.`);
  }
  if (input.challengeCount > 0) {
    reasons.push(`${input.challengeCount} assumption(s) currently show a potential challenge against live data.`);
  }
  if (input.highImpactOpenRiskCount > 0) {
    reasons.push(`${input.highImpactOpenRiskCount} high-impact risk(s) currently being monitored or escalating.`);
  }
  if (input.failedCatalystCount > 0) {
    reasons.push(`${input.failedCatalystCount} catalyst(s) marked as failed.`);
  }

  const reviewOverdue = input.daysSinceLastReview === null || input.daysSinceLastReview > input.reviewOverdueDays;
  if (input.daysSinceLastReview === null) {
    reasons.push('No review has ever been completed for this case.');
  } else if (reviewOverdue) {
    reasons.push(`Last review was ${input.daysSinceLastReview} days ago (review interval: ${input.reviewOverdueDays} days) — a review is recommended.`);
  }

  let status: ThesisHealthStatus;
  if (input.potentiallyMetInvalidationCount > 0) {
    status = 'REVIEW_REQUIRED';
  } else if (input.challengeCount > 0 || input.highImpactOpenRiskCount > 0) {
    status = 'CHALLENGED';
  } else if (input.failedCatalystCount > 0 || reviewOverdue) {
    status = 'WATCH';
  } else {
    status = 'STABLE';
    reasons.push('No open challenges, no potentially-met invalidation criteria, and no high-impact open risks.');
  }

  return { status, reasons };
}
