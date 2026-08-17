import { describe, expect, it } from 'vitest';
import { segmentByMarketCapBucket, segmentByYear } from './robustness';

describe('segmentByYear', () => {
  it('groups observations by the calendar year of their date, sorted ascending', () => {
    const result = segmentByYear([
      { date: '2023-06-01', returnPct: 0.1 },
      { date: '2021-01-01', returnPct: 0.2 },
      { date: '2023-11-01', returnPct: -0.05 },
    ]);
    expect(result.map((s) => s.segment)).toEqual(['2021', '2023']);
    expect(result[1]?.stats.count).toBe(2);
  });
});

describe('segmentByMarketCapBucket', () => {
  it('buckets by market cap and excludes observations with an unknown market cap', () => {
    const result = segmentByMarketCapBucket([
      { date: '2023-01-01', returnPct: 0.1, marketCap: 1_000_000_000 }, // Small
      { date: '2023-01-01', returnPct: 0.2, marketCap: 5_000_000_000 }, // Mid
      { date: '2023-01-01', returnPct: 0.3, marketCap: null }, // excluded
    ]);
    const small = result.find((s) => s.segment.startsWith('Small'));
    const mid = result.find((s) => s.segment.startsWith('Mid'));
    expect(small?.stats.count).toBe(1);
    expect(mid?.stats.count).toBe(1);
    expect(result.reduce((sum, s) => sum + s.stats.count, 0)).toBe(2);
  });
});
