import { describe, expect, it } from 'vitest';
import { discountFactor, presentValue, sumPresentValues } from './discounting';

describe('discountFactor', () => {
  it('1 / (1+WACC)^t', () => {
    expect(discountFactor(0.1, 1)).toBeCloseTo(0.9091, 4);
    expect(discountFactor(0.1, 2)).toBeCloseTo(0.8264, 4);
  });

  it('year 0 has a discount factor of 1 (undiscounted)', () => {
    expect(discountFactor(0.1, 0)).toBe(1);
  });

  it('is null for a WACC at or below -100%, which is not a real discount rate', () => {
    expect(discountFactor(-1, 1)).toBeNull();
    expect(discountFactor(-1.5, 1)).toBeNull();
  });

  it('is null when WACC is unavailable', () => {
    expect(discountFactor(null, 1)).toBeNull();
  });
});

describe('presentValue', () => {
  it('cash flow times its discount factor', () => {
    expect(presentValue(1000, 0.9091)).toBeCloseTo(909.1, 1);
  });

  it('is null if either input is missing', () => {
    expect(presentValue(null, 0.9)).toBeNull();
    expect(presentValue(1000, null)).toBeNull();
  });
});

describe('sumPresentValues', () => {
  it('sums a full series', () => {
    expect(sumPresentValues([100, 200, 300])).toBe(600);
  });

  it('is null if any single year is unknown — a partial sum would misstate the total', () => {
    expect(sumPresentValues([100, null, 300])).toBeNull();
  });
});
