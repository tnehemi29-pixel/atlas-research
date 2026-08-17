import { describe, expect, it } from 'vitest';
import { classifyValuationSpread } from './valuationSpread';

describe('classifyValuationSpread', () => {
  it('matches the milestone spec\'s own worked example exactly (12x vs 18x peer median = -33% = Discount)', () => {
    const result = classifyValuationSpread(12, 18);
    expect(result?.spreadPct).toBeCloseTo(-0.3333, 3);
    expect(result?.bucket).toBe('DISCOUNT');
  });

  it('classifies a premium spread', () => {
    const result = classifyValuationSpread(22, 18);
    expect(result?.spreadPct).toBeCloseTo(0.2222, 3);
    expect(result?.bucket).toBe('PREMIUM');
  });

  it('classifies a narrow spread as neutral', () => {
    const result = classifyValuationSpread(19, 18);
    expect(result?.bucket).toBe('NEUTRAL');
  });

  it('respects custom thresholds over the defaults', () => {
    // A -10% spread is Neutral under the default -15%/+15% thresholds...
    expect(classifyValuationSpread(16.2, 18)?.bucket).toBe('NEUTRAL');
    // ...but Discount under a tighter -5%/+5% threshold.
    expect(classifyValuationSpread(16.2, 18, { discountAt: -0.05, premiumAt: 0.05 })?.bucket).toBe('DISCOUNT');
  });

  it('returns null for a zero or non-finite peer median rather than dividing by zero', () => {
    expect(classifyValuationSpread(12, 0)).toBeNull();
    expect(classifyValuationSpread(12, NaN)).toBeNull();
  });
});
