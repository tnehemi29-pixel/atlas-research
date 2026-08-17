import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';

/**
 * Integration test against the real local Postgres — the caching/gap-fill
 * logic is the whole point of this service, so it needs real DB state, not
 * a mock. Only the network-hitting provider is mocked.
 */

vi.mock('@/lib/providers/marketData/fmpMarketData', () => ({ fmpMarketDataProvider: { name: 'FMP', getHistoricalPrices: vi.fn() } }));

import { fmpMarketDataProvider } from '@/lib/providers/marketData/fmpMarketData';
import { addMonths, getForwardReturn, getHistoricalPrices, getPriceAsOf } from './historicalPriceService';

const TICKER = 'ZZBACKTEST1';

function bar(date: string, close: number) {
  return { date, close, adjClose: close, open: close, high: close, low: close, volume: 1000 };
}

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('historicalPriceService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockReset();
    const company = await db.company.findUnique({ where: { ticker: TICKER } });
    if (company) await db.historicalPriceBar.deleteMany({ where: { companyId: company.id } });
  });

  it('addMonths adds calendar months, not a 30-day approximation', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-03-03'); // Feb has 28 days in 2026 -> JS Date rolls over
    expect(addMonths('2026-06-15', 3)).toBe('2026-09-15');
    expect(addMonths('2026-06-15', 12)).toBe('2027-06-15');
  });

  it('fetches and caches a range on first request', async () => {
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockResolvedValue([bar('2026-01-05', 100), bar('2026-01-06', 101)]);

    const rows = await getHistoricalPrices(TICKER, '2026-01-01', '2026-01-10');
    expect(rows).toEqual([bar('2026-01-05', 100), bar('2026-01-06', 101)]);
    expect(fmpMarketDataProvider.getHistoricalPrices).toHaveBeenCalledTimes(1);
  });

  it('never re-fetches a range already fully cached', async () => {
    // Bars near both edges of the first fetch, so the second request's
    // range sits strictly within the cached bar bounds — coverage is
    // inferred from the min/max of stored bars, so a request must fall
    // within (not merely overlap) an already-fetched span to skip the
    // provider entirely; see the docstring on ensureCachedRange.
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockResolvedValue([bar('2026-01-02', 100), bar('2026-01-09', 105)]);
    await getHistoricalPrices(TICKER, '2026-01-01', '2026-01-10');
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockClear();

    const rows = await getHistoricalPrices(TICKER, '2026-01-03', '2026-01-08');
    expect(rows).toEqual([]);
    expect(fmpMarketDataProvider.getHistoricalPrices).not.toHaveBeenCalled();
  });

  it('backfills only the missing side when a request extends the cached range earlier and later', async () => {
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockResolvedValueOnce([bar('2026-03-01', 110)]);
    await getHistoricalPrices(TICKER, '2026-03-01', '2026-03-01');

    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockReset();
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices)
      .mockResolvedValueOnce([bar('2026-01-05', 90)]) // earlier backfill
      .mockResolvedValueOnce([bar('2026-05-05', 130)]); // later backfill

    const rows = await getHistoricalPrices(TICKER, '2026-01-01', '2026-06-01');
    expect(rows.map((r) => r.date)).toEqual(['2026-01-05', '2026-03-01', '2026-05-05']);
    expect(fmpMarketDataProvider.getHistoricalPrices).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mock.calls;
    expect(calls[0]).toEqual([TICKER, '2026-01-01', '2026-02-28']);
    expect(calls[1]).toEqual([TICKER, '2026-03-02', '2026-06-01']);
  });

  it('never throws when the provider is unavailable — degrades to whatever is cached', async () => {
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockRejectedValue(new Error('rate limited'));
    const rows = await getHistoricalPrices(TICKER, '2026-01-01', '2026-01-10');
    expect(rows).toEqual([]);
  });

  it('getPriceAsOf returns the nearest trading-day close on or before the date, never a fabricated price', async () => {
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockResolvedValue([bar('2026-01-02', 100), bar('2026-01-05', 102)]); // Jan 3-4 is a weekend

    expect(await getPriceAsOf(TICKER, '2026-01-05')).toEqual({ date: '2026-01-05', close: 102 });
    expect(await getPriceAsOf(TICKER, '2026-01-04')).toEqual({ date: '2026-01-02', close: 100 });
    expect(await getPriceAsOf(TICKER, '2025-12-01')).toBeNull();
  });

  it('getForwardReturn computes (toPrice/fromPrice - 1) using the nearest trading days at the horizon', async () => {
    // 2026-01-05 + 3 calendar months = 2026-04-05 exactly.
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockResolvedValue([bar('2026-01-05', 100), bar('2026-04-05', 110)]);

    const result = await getForwardReturn(TICKER, '2026-01-05', 3);
    expect(result).toMatchObject({ fromDate: '2026-01-05', fromPrice: 100, toDate: '2026-04-05', toPrice: 110 });
    expect(result?.returnPct).toBeCloseTo(0.1);
  });

  it('getForwardReturn returns null when the horizon has not actually elapsed in available data', async () => {
    vi.mocked(fmpMarketDataProvider.getHistoricalPrices).mockResolvedValue([bar('2026-01-05', 100)]); // no data at all beyond the start date

    expect(await getForwardReturn(TICKER, '2026-01-05', 12)).toBeNull();
  });
});
