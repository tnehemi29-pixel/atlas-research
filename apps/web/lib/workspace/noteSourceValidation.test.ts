import { describe, expect, it } from 'vitest';
import { isRowBackedSourceType, validateNoteSource } from './noteSourceValidation';

describe('noteSourceValidation', () => {
  it('rejects a missing or blank label regardless of source type', () => {
    expect(validateNoteSource({ sourceType: 'OTHER', sourceId: null, sourceLabel: '' }, null).valid).toBe(false);
    expect(validateNoteSource({ sourceType: 'OTHER', sourceId: null, sourceLabel: '   ' }, null).valid).toBe(false);
  });

  it('accepts a non-row-backed source type with only a label', () => {
    const result = validateNoteSource({ sourceType: 'FINANCIAL_STATEMENT', sourceId: null, sourceLabel: 'Q3 2026 fundamentals' }, null);
    expect(result.valid).toBe(true);
    expect(isRowBackedSourceType('FINANCIAL_STATEMENT')).toBe(false);
  });

  it('rejects a row-backed source type with no id', () => {
    const result = validateNoteSource({ sourceType: 'EARNINGS_CALL', sourceId: null, sourceLabel: 'Q3 2026 earnings call' }, null);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/must reference a real/);
  });

  it('rejects a row-backed source type when the referenced row does not exist', () => {
    const result = validateNoteSource({ sourceType: 'TEN_Q', sourceId: 'does-not-exist', sourceLabel: 'Q3 2026 10-Q' }, false);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not exist/);
  });

  it('accepts a row-backed source type when the referenced row exists', () => {
    const result = validateNoteSource({ sourceType: 'TEN_Q', sourceId: 'real-filing-id', sourceLabel: 'Q3 2026 10-Q' }, true);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('rejects when existence could not be verified at all', () => {
    const result = validateNoteSource({ sourceType: 'RESEARCH_EVENT', sourceId: 'evt-1', sourceLabel: 'Margin compression event' }, null);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/could not verify/i);
  });

  it.each(['TEN_K', 'TEN_Q', 'EIGHT_K', 'EARNINGS_CALL', 'RESEARCH_EVENT', 'RESEARCH_REPORT', 'INVESTMENT_CASE'] as const)('%s is row-backed', (type) => {
    expect(isRowBackedSourceType(type)).toBe(true);
  });

  it.each(['FINANCIAL_STATEMENT', 'DCF_ASSUMPTION', 'OTHER'] as const)('%s is not row-backed', (type) => {
    expect(isRowBackedSourceType(type)).toBe(false);
  });
});
