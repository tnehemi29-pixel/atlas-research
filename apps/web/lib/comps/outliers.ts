import { median } from './statistics';
import type { OutlierAnalysis } from './types';

/**
 * Outlier detection via Tukey's IQR method — the standard, well-known
 * approach for flagging unusual values in a small sample, not an invented
 * heuristic:
 *
 *   1. Sort the values. Split at the median into a lower and upper half
 *      (the median itself is excluded from both halves on an odd-sized set —
 *      "Tukey's hinges").
 *   2. Q1 = median of the lower half, Q3 = median of the upper half.
 *   3. IQR = Q3 - Q1.
 *   4. Bounds = [Q1 - 1.5*IQR, Q3 + 1.5*IQR] — the conventional 1.5x
 *      multiplier used across statistics generally (box-and-whisker plots,
 *      etc.), not a number picked to produce a particular result here.
 *   5. Anything outside the bounds is *flagged* as a potential outlier —
 *      never removed. The caller decides whether to exclude it.
 *
 * Needs at least 4 data points to produce a meaningful quartile split; with
 * fewer, bounds are degenerate and this returns no flags rather than a
 * misleading one.
 */

const MIN_SAMPLE_SIZE = 4;

function splitAtMedian(sortedValues: number[]): { lowerHalf: number[]; upperHalf: number[] } {
  const n = sortedValues.length;
  const mid = Math.floor(n / 2);
  const lowerHalf = sortedValues.slice(0, mid);
  const upperHalf = n % 2 === 0 ? sortedValues.slice(mid) : sortedValues.slice(mid + 1);
  return { lowerHalf, upperHalf };
}

const EMPTY_ANALYSIS: OutlierAnalysis = {
  q1: null,
  q3: null,
  iqr: null,
  lowerBound: null,
  upperBound: null,
  outlierTickers: [],
};

export function detectOutliersIQR(entries: Array<{ ticker: string; value: number }>): OutlierAnalysis {
  if (entries.length < MIN_SAMPLE_SIZE) return EMPTY_ANALYSIS;

  const sorted = [...entries].sort((a, b) => a.value - b.value);
  const { lowerHalf, upperHalf } = splitAtMedian(sorted.map((entry) => entry.value));
  const q1 = median(lowerHalf);
  const q3 = median(upperHalf);
  if (q1 === null || q3 === null) return EMPTY_ANALYSIS;

  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const outlierTickers = sorted
    .filter((entry) => entry.value < lowerBound || entry.value > upperBound)
    .map((entry) => entry.ticker);

  return { q1, q3, iqr, lowerBound, upperBound, outlierTickers };
}
