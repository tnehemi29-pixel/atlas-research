import { describe, expect, it } from 'vitest';
import type { PriceBarRow } from '@/lib/services/historicalPriceService';
import { computeEventWindowReturn } from './eventStudy';

function bar(date: string, close: number): PriceBarRow {
  return { date, close, adjClose: close, open: close, high: close, low: close, volume: 1000 };
}

// Ten consecutive trading days, prices rising 100 -> 109.
const STOCK_BARS: PriceBarRow[] = [
  bar('2026-03-02', 100),
  bar('2026-03-03', 101),
  bar('2026-03-04', 102),
  bar('2026-03-05', 103),
  bar('2026-03-06', 104), // event date, index 4
  bar('2026-03-09', 105),
  bar('2026-03-10', 106),
  bar('2026-03-11', 107),
  bar('2026-03-12', 108),
  bar('2026-03-13', 109),
];

// Benchmark flat at 200 -> 204 over the same span (a milder move).
const BENCHMARK_BARS: PriceBarRow[] = [
  bar('2026-03-02', 200),
  bar('2026-03-03', 200.5),
  bar('2026-03-04', 201),
  bar('2026-03-05', 201.5),
  bar('2026-03-06', 202),
  bar('2026-03-09', 202.5),
  bar('2026-03-10', 203),
  bar('2026-03-11', 203.5),
  bar('2026-03-12', 204),
  bar('2026-03-13', 204.5),
];

describe('computeEventWindowReturn', () => {
  it('computes stock return, benchmark return, and abnormal return over a [-1,+1] trading-day window', () => {
    const result = computeEventWindowReturn(STOCK_BARS, BENCHMARK_BARS, '2026-03-06', { label: '[-1,+1]', preDays: 1, postDays: 1 });
    expect(result).not.toBeNull();
    expect(result?.windowStartDate).toBe('2026-03-05');
    expect(result?.windowEndDate).toBe('2026-03-09');
    // Stock: 103 -> 105 = +1.942%; Benchmark: 201.5 -> 202.5 = +0.496%
    expect(result?.stockReturn).toBeCloseTo(105 / 103 - 1);
    expect(result?.benchmarkReturn).toBeCloseTo(202.5 / 201.5 - 1);
    expect(result?.abnormalReturn).toBeCloseTo((105 / 103 - 1) - (202.5 / 201.5 - 1));
  });

  it('uses the nearest trading day on or before the event date, not an exact match', () => {
    // 2026-03-07/08 is a weekend — the event "happens" then but the nearest
    // available bar is the Friday close (2026-03-06, index 4).
    const result = computeEventWindowReturn(STOCK_BARS, BENCHMARK_BARS, '2026-03-08', { label: '[-1,+1]', preDays: 1, postDays: 1 });
    expect(result?.windowStartDate).toBe('2026-03-05');
    expect(result?.windowEndDate).toBe('2026-03-09');
  });

  it('returns null when the window extends past the available data on either side', () => {
    // Event at the very first bar — no room for a pre-day.
    expect(computeEventWindowReturn(STOCK_BARS, BENCHMARK_BARS, '2026-03-02', { label: '[-1,+1]', preDays: 1, postDays: 1 })).toBeNull();
    // Event at the very last bar — no room for a post-day.
    expect(computeEventWindowReturn(STOCK_BARS, BENCHMARK_BARS, '2026-03-13', { label: '[-1,+1]', preDays: 1, postDays: 1 })).toBeNull();
    // A wider window than the fixture supports at all.
    expect(computeEventWindowReturn(STOCK_BARS, BENCHMARK_BARS, '2026-03-06', { label: '[-5,+5]', preDays: 5, postDays: 5 })).toBeNull();
  });

  it('returns null when the event date predates the entire series', () => {
    expect(computeEventWindowReturn(STOCK_BARS, BENCHMARK_BARS, '2025-01-01', { label: '[-1,+1]', preDays: 1, postDays: 1 })).toBeNull();
  });

  it('still returns the stock return with a null benchmark leg (and null abnormal return) when benchmark data is missing entirely', () => {
    const result = computeEventWindowReturn(STOCK_BARS, [], '2026-03-06', { label: '[-1,+1]', preDays: 1, postDays: 1 });
    expect(result?.stockReturn).not.toBeNull();
    expect(result?.benchmarkReturn).toBeNull();
    expect(result?.abnormalReturn).toBeNull();
  });
});
