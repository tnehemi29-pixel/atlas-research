import { describe, expect, it } from 'vitest';
import { computeThesisHealth } from './thesisHealth';

const BASELINE = { challengeCount: 0, potentiallyMetInvalidationCount: 0, highImpactOpenRiskCount: 0, failedCatalystCount: 0, daysSinceLastReview: 10, reviewOverdueDays: 90 };

describe('computeThesisHealth', () => {
  it('is STABLE with no open issues and a recent review, and says why', () => {
    const result = computeThesisHealth(BASELINE);
    expect(result.status).toBe('STABLE');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('is REVIEW_REQUIRED when an invalidation criterion is potentially met — takes priority over everything else', () => {
    const result = computeThesisHealth({ ...BASELINE, potentiallyMetInvalidationCount: 1, challengeCount: 5 });
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.reasons.some((r) => r.includes('invalidation'))).toBe(true);
  });

  it('is CHALLENGED when there is an open assumption challenge but no invalidation trigger', () => {
    const result = computeThesisHealth({ ...BASELINE, challengeCount: 1 });
    expect(result.status).toBe('CHALLENGED');
  });

  it('is CHALLENGED when a high-impact risk is open', () => {
    const result = computeThesisHealth({ ...BASELINE, highImpactOpenRiskCount: 1 });
    expect(result.status).toBe('CHALLENGED');
  });

  it('is WATCH when a review is overdue, with no other issues', () => {
    const result = computeThesisHealth({ ...BASELINE, daysSinceLastReview: 200 });
    expect(result.status).toBe('WATCH');
    expect(result.reasons.some((r) => r.includes('recommended'))).toBe(true);
  });

  it('is WATCH when no review has ever been completed', () => {
    const result = computeThesisHealth({ ...BASELINE, daysSinceLastReview: null });
    expect(result.status).toBe('WATCH');
    expect(result.reasons.some((r) => r.includes('No review has ever been completed'))).toBe(true);
  });

  it('always includes a documented reason — never a bare status with no explanation', () => {
    for (const input of [
      BASELINE,
      { ...BASELINE, potentiallyMetInvalidationCount: 1 },
      { ...BASELINE, challengeCount: 2 },
      { ...BASELINE, failedCatalystCount: 1 },
    ]) {
      const result = computeThesisHealth(input);
      expect(result.reasons.length).toBeGreaterThan(0);
    }
  });
});
