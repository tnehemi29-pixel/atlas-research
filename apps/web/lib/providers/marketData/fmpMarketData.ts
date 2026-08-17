import { getHistoricalPricesFmp } from '@/lib/providers/fmp';
import type { MarketDataProvider, PriceBar } from './types';

/**
 * The only `MarketDataProvider` implementation wired up today — a thin
 * adapter over lib/providers/fmp.ts's own historical-price call. Contains
 * zero FMP-specific parsing itself (that lives in fmp.ts, same as every
 * other FMP endpoint in this codebase); this file's only job is satisfying
 * the provider-agnostic interface callers depend on.
 */
export const fmpMarketDataProvider: MarketDataProvider = {
  name: 'FMP',
  async getHistoricalPrices(ticker: string, from: string, to: string): Promise<PriceBar[]> {
    const bars = await getHistoricalPricesFmp(ticker, from, to);
    return bars.map((bar) => ({
      date: bar.date,
      close: bar.close,
      adjClose: bar.adjClose,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      volume: bar.volume,
    }));
  },
};
