import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHistoricalPricesFmp } from './fmp';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('getHistoricalPricesFmp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a plain array response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          { date: '2026-08-10', close: 101.5, adjClose: 101.5, open: 100, high: 102, low: 99, volume: 1_000_000 },
          { date: '2026-08-11', close: 103.2, open: 101, high: 104, low: 100, volume: 900_000 },
        ]),
      ),
    );

    const bars = await getHistoricalPricesFmp('AAPL', '2026-08-01', '2026-08-11');
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({ date: '2026-08-10', close: 101.5, adjClose: 101.5, open: 100, high: 102, low: 99, volume: 1_000_000 });
    // Missing adjClose is left null, never estimated.
    expect(bars[1]?.adjClose).toBeNull();
  });

  it('unwraps a { historical: [...] } response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ symbol: 'AAPL', historical: [{ date: '2026-08-10', close: 101.5 }] })));

    const bars = await getHistoricalPricesFmp('AAPL', '2026-08-01', '2026-08-11');
    expect(bars).toEqual([{ date: '2026-08-10', close: 101.5, adjClose: null, open: null, high: null, low: null, volume: null }]);
  });

  it('drops rows missing a required field (date or close) rather than fabricating one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          { date: '2026-08-10', close: 101.5 },
          { date: '2026-08-11' }, // no close
          { close: 99.0 }, // no date
        ]),
      ),
    );

    const bars = await getHistoricalPricesFmp('AAPL', '2026-08-01', '2026-08-11');
    expect(bars).toHaveLength(1);
  });

  it('returns an empty array for an unrecognized response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ unexpected: true })));
    expect(await getHistoricalPricesFmp('AAPL', '2026-08-01', '2026-08-11')).toEqual([]);
  });
});
