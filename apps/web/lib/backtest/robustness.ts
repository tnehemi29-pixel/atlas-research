import { summarizeDistribution, type DistributionStats } from './statistics';
import { MARKET_CAP_BUCKETS } from './backtestConfig';

/**
 * Robustness segmentation (spec section 12: "avoid cherry-picking... allow
 * segmentation by market regime / sector / company size / time period /
 * bull-bear / volatility regime where data permits"). Pure grouping math —
 * lib/services/backtestService.ts supplies the dated, ticker-tagged
 * observations from whichever analysis is being segmented.
 *
 * Scope note: only time-period (calendar year) and company-size (market-cap
 * bucket) segmentation are implemented. Sector and market-regime
 * (bull/bear/volatility) segmentation are NOT implemented in this milestone
 * because Atlas has no point-in-time sector classification or regime-label
 * series — segmenting by a company's CURRENT sector or a CURRENT regime
 * label would misrepresent historical conditions. This is a disclosed scope
 * limitation ("where data permits"), not a silent omission.
 */

export interface DatedReturn {
  date: string;
  returnPct: number;
  marketCap?: number | null;
}

export interface SegmentResult {
  segment: string;
  stats: DistributionStats;
}

/** Segments by the calendar year of each observation's own date. */
export function segmentByYear(observations: DatedReturn[]): SegmentResult[] {
  const byYear = new Map<string, number[]>();
  for (const o of observations) {
    const year = o.date.slice(0, 4);
    const values = byYear.get(year) ?? [];
    values.push(o.returnPct);
    byYear.set(year, values);
  }
  return [...byYear.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([segment, values]) => ({ segment, stats: summarizeDistribution(values) }));
}

/** Segments by market-cap bucket. Observations with an unknown (`null` or
 * `undefined`) market cap are excluded from this axis entirely — never
 * folded into the smallest bucket, which would misrepresent them. */
export function segmentByMarketCapBucket(observations: DatedReturn[]): SegmentResult[] {
  return MARKET_CAP_BUCKETS.map((bucket, i) => {
    const minMarketCap = i === 0 ? 0 : MARKET_CAP_BUCKETS[i - 1]!.maxMarketCap;
    const values = observations
      .filter((o) => o.marketCap != null && o.marketCap > minMarketCap && o.marketCap <= bucket.maxMarketCap)
      .map((o) => o.returnPct);
    return { segment: bucket.label, stats: summarizeDistribution(values) };
  });
}
