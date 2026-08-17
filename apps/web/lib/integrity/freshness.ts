import type { FreshnessStatus, IntegrityDatasetType } from '@prisma/client';

/**
 * Milestone 14 spec section 3 — data freshness. A dataset's freshness is
 * always judged against an EXPECTED refresh frequency for that specific kind
 * of data (market data should be near-daily; SEC filings arrive quarterly at
 * best) — never one universal staleness window applied to everything.
 *
 * CURRENT: within the expected refresh window.
 * AGING: past the expected window but within a grace multiplier — "you
 *        should refresh this soon," not yet "this is unreliable."
 * STALE: past the grace window — the data is old enough that a reader
 *        should not treat it as representative of the company today.
 * UNKNOWN: no timestamp at all — never silently treated as CURRENT.
 */

// Days before a dataset of this type is expected to have been refreshed.
// Configuration, not logic — deliberately separate from the classification
// function below so a reviewer can see every dataset's expectation in one
// place.
export const DEFAULT_REFRESH_FREQUENCY_DAYS: Record<IntegrityDatasetType, number> = {
  MARKET_DATA: 1,
  FINANCIAL_STATEMENTS: 100, // roughly one fiscal quarter plus filing lag
  SEC_FILINGS: 100,
  EARNINGS: 100,
  DCF_MODEL: 100,
  COMPS_MODEL: 7, // peer market data moves daily even when peer selection doesn't
  HISTORICAL_VALIDATION: 100,
  RESEARCH_REPORT: 100,
  INVESTMENT_CASE: 100,
};

/** A dataset is AGING once it's past its own expected window, and STALE once
 * it's past `agingMultiplier` times that window — e.g. financial statements
 * (100-day expectation) become AGING at 100 days and STALE at 200. */
const DEFAULT_AGING_MULTIPLIER = 2;

export function classifyFreshness(
  dataTimestamp: Date | string | null,
  expectedRefreshFrequencyDays: number,
  now: Date = new Date(),
  agingMultiplier: number = DEFAULT_AGING_MULTIPLIER,
): FreshnessStatus {
  if (dataTimestamp === null) return 'UNKNOWN';

  const timestamp = typeof dataTimestamp === 'string' ? new Date(dataTimestamp) : dataTimestamp;
  if (Number.isNaN(timestamp.getTime())) return 'UNKNOWN';

  const ageDays = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 'UNKNOWN'; // a future timestamp is not trustworthy either
  if (ageDays <= expectedRefreshFrequencyDays) return 'CURRENT';
  if (ageDays <= expectedRefreshFrequencyDays * agingMultiplier) return 'AGING';
  return 'STALE';
}

/** Convenience wrapper using this dataset type's own configured expectation
 * rather than requiring every call site to look up the frequency itself. */
export function classifyDatasetFreshness(datasetType: IntegrityDatasetType, dataTimestamp: Date | string | null, now: Date = new Date()): FreshnessStatus {
  return classifyFreshness(dataTimestamp, DEFAULT_REFRESH_FREQUENCY_DAYS[datasetType], now);
}

export const FRESHNESS_LABELS: Record<FreshnessStatus, string> = {
  CURRENT: 'Current',
  AGING: 'Aging',
  STALE: 'Stale',
  UNKNOWN: 'Unknown',
};
