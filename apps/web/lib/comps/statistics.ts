import type { StatSummary } from './types';

/**
 * Plain descriptive statistics over a set of numbers — no knowledge of
 * multiples, companies, or outliers. `summarize` is what turns a peer set's
 * raw multiple values into the min/max/mean/median row the comps table and
 * the implied-valuation calculation both read from.
 */

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid] as number;
  }
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function min(values: number[]): number | null {
  return values.length === 0 ? null : Math.min(...values);
}

export function max(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

/** Builds the full min/max/mean/median summary for a set of values — `null`
 * inputs (e.g. from `Multiple`s that were N/M or missing) are filtered out
 * first, and `count` reports how many values actually went into the stats,
 * so the UI can show "based on N of M peers" rather than pretending every
 * peer contributed. */
export function summarize(values: Array<number | null>): StatSummary {
  const present = values.filter((value): value is number => value !== null);
  return {
    count: present.length,
    min: min(present),
    max: max(present),
    mean: mean(present),
    median: median(present),
  };
}
