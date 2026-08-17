import { describe, expect, it } from 'vitest';
import { costBasisOf, marketValue, portfolioWeight, unrealizedGainLoss, unrealizedReturn, weightedAverage } from './calculations';

describe('marketValue', () => {
  it('multiplies shares by current price', () => {
    expect(marketValue(10, 25)).toBe(250);
  });

  it('handles fractional shares', () => {
    expect(marketValue(2.5, 40)).toBe(100);
  });

  it('returns null when price is missing', () => {
    expect(marketValue(10, null)).toBeNull();
  });
});

describe('costBasisOf', () => {
  it('multiplies shares by average cost', () => {
    expect(costBasisOf(10, 20)).toBe(200);
  });

  it('handles fractional shares', () => {
    expect(costBasisOf(3.25, 10)).toBe(32.5);
  });

  it('is zero when average cost is zero (gifted shares)', () => {
    expect(costBasisOf(10, 0)).toBe(0);
  });
});

describe('unrealizedGainLoss', () => {
  it('is market value minus cost basis', () => {
    expect(unrealizedGainLoss(300, 200)).toBe(100);
  });

  it('can be negative', () => {
    expect(unrealizedGainLoss(150, 200)).toBe(-50);
  });

  it('is null when market value is unavailable', () => {
    expect(unrealizedGainLoss(null, 200)).toBeNull();
  });
});

describe('unrealizedReturn', () => {
  it('is gain/loss divided by cost basis', () => {
    expect(unrealizedReturn(50, 200)).toBe(0.25);
  });

  it('returns null for a zero cost basis rather than Infinity', () => {
    expect(unrealizedReturn(50, 0)).toBeNull();
  });

  it('returns null when gain/loss is unavailable', () => {
    expect(unrealizedReturn(null, 200)).toBeNull();
  });

  it('handles a full loss (return of -1)', () => {
    expect(unrealizedReturn(-200, 200)).toBe(-1);
  });
});

describe('portfolioWeight', () => {
  it('is holding market value divided by total', () => {
    expect(portfolioWeight(250, 1000)).toBe(0.25);
  });

  it('returns null when total is zero', () => {
    expect(portfolioWeight(250, 0)).toBeNull();
  });

  it('returns null when either input is missing', () => {
    expect(portfolioWeight(null, 1000)).toBeNull();
    expect(portfolioWeight(250, null)).toBeNull();
  });
});

describe('weightedAverage', () => {
  it('weights each value by its weight', () => {
    // 60% weight at 10%, 40% weight at 20% -> 14%
    const result = weightedAverage([
      { value: 0.1, weight: 0.6 },
      { value: 0.2, weight: 0.4 },
    ]);
    expect(result).toBeCloseTo(0.14);
  });

  it('skips items missing a value rather than treating it as zero', () => {
    const result = weightedAverage([
      { value: 0.1, weight: 0.5 },
      { value: null, weight: 0.5 },
    ]);
    // Only the first item contributes -> its own value, not dragged toward 0.
    expect(result).toBeCloseTo(0.1);
  });

  it('skips items missing a weight', () => {
    const result = weightedAverage([
      { value: 0.1, weight: 0.5 },
      { value: 0.9, weight: null },
    ]);
    expect(result).toBeCloseTo(0.1);
  });

  it('returns null when no item has both a value and a positive weight', () => {
    expect(weightedAverage([{ value: null, weight: 0.5 }, { value: 0.1, weight: null }])).toBeNull();
    expect(weightedAverage([])).toBeNull();
  });
});
