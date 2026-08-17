import { describe, expect, it } from 'vitest';
import { summarizeDistribution } from './statistics';
import { MIN_OBSERVATIONS_FOR_STATS } from './backtestConfig';

describe('summarizeDistribution', () => {
  it('returns all-null stats and insufficientData for an empty sample', () => {
    const result = summarizeDistribution([]);
    expect(result).toEqual({ count: 0, mean: null, median: null, stdDev: null, positiveRate: null, confidenceInterval95: null, insufficientData: true });
  });

  it('computes mean, median, positive rate for a small (below-minimum) sample without a confidence interval', () => {
    const result = summarizeDistribution([0.1, -0.05, 0.2]);
    expect(result.count).toBe(3);
    expect(result.mean).toBeCloseTo((0.1 - 0.05 + 0.2) / 3);
    expect(result.median).toBeCloseTo(0.1);
    expect(result.positiveRate).toBeCloseTo(2 / 3);
    expect(result.insufficientData).toBe(true);
    expect(result.confidenceInterval95).toBeNull();
  });

  it('computes a full distribution (stdDev + 95% CI) once the sample reaches the minimum', () => {
    const values = [0.1, 0.05, -0.02, 0.08, 0.15]; // exactly MIN_OBSERVATIONS_FOR_STATS
    expect(values.length).toBe(MIN_OBSERVATIONS_FOR_STATS);

    const result = summarizeDistribution(values);
    expect(result.insufficientData).toBe(false);
    expect(result.stdDev).not.toBeNull();
    expect(result.confidenceInterval95).not.toBeNull();
    const [lower, upper] = result.confidenceInterval95!;
    expect(lower).toBeLessThan(result.mean!);
    expect(upper).toBeGreaterThan(result.mean!);
  });

  it('median handles an even-length sample by averaging the two middle values', () => {
    const result = summarizeDistribution([0.1, 0.3, 0.2, 0.4]);
    expect(result.median).toBeCloseTo(0.25);
  });

  it('positiveRate counts exactly zero as not positive', () => {
    const result = summarizeDistribution([0, 0.1, -0.1]);
    expect(result.positiveRate).toBeCloseTo(1 / 3);
  });
});
