import { CONFIDENCE_Z_95, MIN_OBSERVATIONS_FOR_STATS } from './backtestConfig';

/**
 * Every historical-analysis result in Milestone 12 flows through this one
 * summarizer (spec section 15: "For every historical analysis display:
 * number of observations, mean, median, standard deviation..."). No caller
 * computes its own mean/median — one place, one convention, so "average
 * return" means the same arithmetic everywhere in this milestone.
 */

export interface DistributionStats {
  count: number;
  mean: number | null;
  median: number | null;
  /** Sample standard deviation (n-1 denominator) — null below 2 observations. */
  stdDev: number | null;
  /** Fraction of observations strictly greater than 0, e.g. 0.62 = 62%. */
  positiveRate: number | null;
  /** 95% confidence interval on the mean via a normal approximation
   * (mean ± 1.96 * standard error) — null below MIN_OBSERVATIONS_FOR_STATS,
   * never computed on a sample too small to support it. */
  confidenceInterval95: [number, number] | null;
  /** True when count < MIN_OBSERVATIONS_FOR_STATS — callers should show
   * INSUFFICIENT_OBSERVATIONS_MESSAGE instead of the (still-computed, but
   * unreliable) statistics above rather than silently hiding the flag. */
  insufficientData: boolean;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function sampleStdDev(values: number[], meanValue: number): number | null {
  if (values.length < 2) return null;
  const sumSquaredDeviations = values.reduce((sum, v) => sum + (v - meanValue) ** 2, 0);
  return Math.sqrt(sumSquaredDeviations / (values.length - 1));
}

/** Summarizes a distribution of numeric observations (returns, forecast
 * errors, abnormal returns — anything Milestone 12 aggregates). `values`
 * should already have nulls filtered out by the caller, since "how many
 * observations had usable data" IS the count this function reports. */
export function summarizeDistribution(values: number[]): DistributionStats {
  const count = values.length;
  const insufficientData = count < MIN_OBSERVATIONS_FOR_STATS;

  if (count === 0) {
    return { count, mean: null, median: null, stdDev: null, positiveRate: null, confidenceInterval95: null, insufficientData };
  }

  const meanValue = mean(values);
  const medianValue = median(values);
  const stdDev = sampleStdDev(values, meanValue);
  const positiveRate = values.filter((v) => v > 0).length / count;

  let confidenceInterval95: [number, number] | null = null;
  if (!insufficientData && stdDev !== null) {
    const standardError = stdDev / Math.sqrt(count);
    const margin = CONFIDENCE_Z_95 * standardError;
    confidenceInterval95 = [meanValue - margin, meanValue + margin];
  }

  return { count, mean: meanValue, median: medianValue, stdDev, positiveRate, confidenceInterval95, insufficientData };
}
