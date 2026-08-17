import { describe, expect, it } from 'vitest';
import { validateClaimCitation, validateClaimNumber, validateResearchClaim } from './claimValidation';

describe('validateClaimNumber', () => {
  it('verifies a claim that matches its source within tolerance', () => {
    const result = validateClaimNumber(0.11, 0.108);
    expect(result.status).toBe('VERIFIED');
  });

  it('rejects a claim that materially disagrees with its source (the spec\'s own 18% vs 11% example)', () => {
    const result = validateClaimNumber(0.18, 0.11);
    expect(result.status).toBe('REJECTED');
    expect(result.differenceAbsolute).toBeCloseTo(0.07);
  });

  it('rejects the AI-claim example: stated 25% vs. actual 20%', () => {
    const result = validateClaimNumber(0.25, 0.2);
    expect(result.status).toBe('REJECTED');
  });

  it('is UNVERIFIED when the source value is unavailable', () => {
    const result = validateClaimNumber(0.18, null);
    expect(result.status).toBe('UNVERIFIED');
  });
});

describe('validateClaimCitation', () => {
  it('returns true for a citation present in the valid set', () => {
    expect(validateClaimCitation('ev1', new Set(['ev1', 'ev2']))).toBe(true);
  });

  it('returns false for an invalid/unknown source id', () => {
    expect(validateClaimCitation('made-up-id', new Set(['ev1', 'ev2']))).toBe(false);
  });

  it('returns null when there is no citation or no registry to check against', () => {
    expect(validateClaimCitation(null, new Set(['ev1']))).toBeNull();
    expect(validateClaimCitation('ev1', null)).toBeNull();
  });
});

describe('validateResearchClaim', () => {
  it('is VERIFIED when the number matches and the citation is valid', () => {
    const outcome = validateResearchClaim({ statedValue: 0.11, sourceValue: 0.108, citedSourceId: 'ev1', validSourceIds: new Set(['ev1']) });
    expect(outcome.status).toBe('VERIFIED');
  });

  it('is REJECTED when the AI claim disagrees with source data — the spec\'s own required test', () => {
    const outcome = validateResearchClaim({ statedValue: 0.25, sourceValue: 0.2, citedSourceId: 'ev1', validSourceIds: new Set(['ev1']) });
    expect(outcome.status).toBe('REJECTED');
  });

  it('is REJECTED when the cited source id is invalid — the spec\'s own required test', () => {
    const outcome = validateResearchClaim({ statedValue: 0.11, sourceValue: 0.108, citedSourceId: 'made-up-id', validSourceIds: new Set(['ev1']) });
    expect(outcome.status).toBe('REJECTED');
  });

  it('rejects on an invalid citation even when the number happens to be correct', () => {
    const outcome = validateResearchClaim({ statedValue: 0.11, sourceValue: 0.11, citedSourceId: 'nonexistent', validSourceIds: new Set([]) });
    expect(outcome.status).toBe('REJECTED');
  });

  it('is UNVERIFIED when there is nothing to check the number or citation against', () => {
    const outcome = validateResearchClaim({ statedValue: 0.11, sourceValue: null, citedSourceId: null, validSourceIds: null });
    expect(outcome.status).toBe('UNVERIFIED');
  });
});
