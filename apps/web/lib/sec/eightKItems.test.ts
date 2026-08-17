import { describe, expect, it } from 'vitest';
import { categorizeEightKItem } from './eightKItems';

describe('categorizeEightKItem', () => {
  it('maps well-known item codes to their official SEC label and category', () => {
    expect(categorizeEightKItem('2.02')).toEqual({
      label: 'Results of Operations and Financial Condition',
      category: 'EARNINGS',
    });
    expect(categorizeEightKItem('2.01')).toMatchObject({ category: 'ACQUISITION' });
    expect(categorizeEightKItem('5.02')).toMatchObject({ category: 'EXECUTIVE_CHANGE' });
    expect(categorizeEightKItem('1.03')).toMatchObject({ category: 'BANKRUPTCY_RESTRUCTURING' });
    expect(categorizeEightKItem('1.01')).toMatchObject({ category: 'MAJOR_CONTRACT' });
  });

  it('falls back to a generic label for an unrecognized item code rather than throwing', () => {
    const result = categorizeEightKItem('6.05');
    expect(result.category).toBe('OTHER');
    expect(result.label).toContain('6.05');
  });
});
