import { describe, expect, it } from 'vitest';
import { requiredRowField, validateEvidenceSource } from './evidenceValidation';

describe('validateEvidenceSource', () => {
  it('rejects evidence with no source label at all', () => {
    const result = validateEvidenceSource(
      { sourceType: 'DCF', sourceLabel: '', secFilingId: null, earningsCallId: null, researchEventId: null },
      null,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/source label/i);
  });

  it('rejects a row-backed source type (e.g. 10-K) with no id at all — the AI-invented-evidence case', () => {
    // This is exactly the scenario spec section 27 requires a test for: the
    // AI (or anyone) proposes evidence sourced from a 10-K but supplies no
    // actual filing reference — rejected because no valid source exists.
    const result = validateEvidenceSource(
      { sourceType: 'TEN_K', sourceLabel: 'The 10-K discusses margin pressure.', secFilingId: null, earningsCallId: null, researchEventId: null },
      null,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/must reference a real secFilingId/i);
  });

  it('rejects a row-backed source whose id does not resolve to a real row', () => {
    const result = validateEvidenceSource(
      { sourceType: 'EARNINGS_CALL', sourceLabel: 'Q2 call discussion', secFilingId: null, earningsCallId: 'fake-id', researchEventId: null },
      { exists: false, belongsToCompany: false },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not exist/i);
  });

  it('rejects a row-backed source that exists but belongs to a different company', () => {
    const result = validateEvidenceSource(
      { sourceType: 'RESEARCH_EVENT', sourceLabel: 'Guidance cut', secFilingId: null, earningsCallId: null, researchEventId: 'real-id' },
      { exists: true, belongsToCompany: false },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not belong to this investment case/i);
  });

  it('accepts a row-backed source that resolves and belongs to the right company', () => {
    const result = validateEvidenceSource(
      { sourceType: 'EIGHT_K', sourceLabel: 'Material event disclosure', secFilingId: 'real-filing-id', earningsCallId: null, researchEventId: null },
      { exists: true, belongsToCompany: true },
    );
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('accepts a non-row-backed source type (DCF/Comps/Financial Statement/Historical Validation) with only a descriptive label', () => {
    for (const sourceType of ['FINANCIAL_STATEMENT', 'DCF', 'COMPS', 'HISTORICAL_VALIDATION'] as const) {
      const result = validateEvidenceSource(
        { sourceType, sourceLabel: 'FY2024 income statement, operating margin line', secFilingId: null, earningsCallId: null, researchEventId: null },
        null,
      );
      expect(result.valid).toBe(true);
    }
  });

  it('requiredRowField maps each row-backed source type to its own foreign key field', () => {
    expect(requiredRowField('TEN_K')).toBe('secFilingId');
    expect(requiredRowField('TEN_Q')).toBe('secFilingId');
    expect(requiredRowField('EIGHT_K')).toBe('secFilingId');
    expect(requiredRowField('EARNINGS_CALL')).toBe('earningsCallId');
    expect(requiredRowField('RESEARCH_EVENT')).toBe('researchEventId');
    expect(requiredRowField('DCF')).toBeNull();
  });
});
