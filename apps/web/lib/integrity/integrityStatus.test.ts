import { describe, expect, it } from 'vitest';
import { computeIntegrityStatus } from './integrityStatus';

const CLEAN = { criticalFindingCount: 0, highFindingCount: 0, mediumFindingCount: 0, lowFindingCount: 0, staleDatasetCount: 0 };

describe('computeIntegrityStatus', () => {
  it('is VERIFIED with no findings — and says so explicitly, never a bare label', () => {
    const result = computeIntegrityStatus(CLEAN);
    expect(result.status).toBe('VERIFIED');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('is MINOR_ISSUES when only low-severity findings exist', () => {
    const result = computeIntegrityStatus({ ...CLEAN, lowFindingCount: 2 });
    expect(result.status).toBe('MINOR_ISSUES');
    expect(result.reasons.some((r) => r.includes('low-severity'))).toBe(true);
  });

  it('is REVIEW_REQUIRED when a medium-severity finding exists', () => {
    const result = computeIntegrityStatus({ ...CLEAN, mediumFindingCount: 1 });
    expect(result.status).toBe('REVIEW_REQUIRED');
  });

  it('is REVIEW_REQUIRED when a dataset is stale, even with no other findings', () => {
    const result = computeIntegrityStatus({ ...CLEAN, staleDatasetCount: 1 });
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.reasons.some((r) => r.includes('stale'))).toBe(true);
  });

  it('is SIGNIFICANT_ISSUES when a high-severity finding exists', () => {
    const result = computeIntegrityStatus({ ...CLEAN, highFindingCount: 1 });
    expect(result.status).toBe('SIGNIFICANT_ISSUES');
  });

  it('is CRITICAL when any critical finding exists, regardless of other counts', () => {
    const result = computeIntegrityStatus({ criticalFindingCount: 1, highFindingCount: 5, mediumFindingCount: 5, lowFindingCount: 5, staleDatasetCount: 5 });
    expect(result.status).toBe('CRITICAL');
  });

  it('every non-VERIFIED status includes a specific, explainable reason', () => {
    const result = computeIntegrityStatus({ criticalFindingCount: 2, highFindingCount: 1, mediumFindingCount: 0, lowFindingCount: 0, staleDatasetCount: 0 });
    expect(result.reasons).toContain('2 critical finding(s) require immediate review.');
    expect(result.reasons).toContain('1 high-severity finding(s) detected.');
  });
});
