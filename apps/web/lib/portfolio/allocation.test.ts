import { describe, expect, it } from 'vitest';
import { computeAllocation, CONCENTRATION_THRESHOLD } from './allocation';

describe('computeAllocation', () => {
  it('groups holdings by label and computes weights', () => {
    const result = computeAllocation([
      { label: 'Technology', marketValue: 600 },
      { label: 'Financials', marketValue: 300 },
    ]);

    expect(result).toEqual([
      { label: 'Technology', marketValue: 600, weight: 600 / 900, isConcentrated: true },
      { label: 'Financials', marketValue: 300, weight: 300 / 900, isConcentrated: false },
    ]);
  });

  it('combines multiple holdings in the same sector', () => {
    const result = computeAllocation([
      { label: 'Technology', marketValue: 300 },
      { label: 'Technology', marketValue: 300 },
      { label: 'Healthcare', marketValue: 400 },
    ]);

    const tech = result.find((r) => r.label === 'Technology');
    expect(tech?.marketValue).toBe(600);
    expect(tech?.weight).toBe(0.6);
  });

  it('groups a null label as "Unclassified"', () => {
    const result = computeAllocation([{ label: null, marketValue: 100 }]);
    expect(result[0]?.label).toBe('Unclassified');
  });

  it('skips holdings with no market value', () => {
    const result = computeAllocation([
      { label: 'Technology', marketValue: 100 },
      { label: 'Energy', marketValue: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.weight).toBe(1);
  });

  it('returns an empty array when nothing has a market value', () => {
    expect(computeAllocation([{ label: 'Technology', marketValue: null }])).toEqual([]);
    expect(computeAllocation([])).toEqual([]);
  });

  it('flags concentration strictly above the documented threshold, not at it', () => {
    const atThreshold = computeAllocation([
      { label: 'A', marketValue: CONCENTRATION_THRESHOLD * 100 },
      { label: 'B', marketValue: (1 - CONCENTRATION_THRESHOLD) * 100 },
    ]);
    expect(atThreshold.find((r) => r.label === 'A')?.isConcentrated).toBe(false);
  });
});
