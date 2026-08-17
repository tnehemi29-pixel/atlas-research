/**
 * The abstraction Milestone 12 requires so historical price data is never
 * hard-wired to one vendor — "do not make the system dependent on a single
 * data provider." Every consumer in this codebase (lib/services/
 * historicalPriceService.ts and everything built on top of it) talks only
 * to this interface, never to lib/providers/fmp.ts directly. Adding a
 * second provider later (e.g. a paid vendor with real point-in-time/
 * delisted-company coverage) means writing one new file that implements
 * `MarketDataProvider`, not touching any calling code.
 */

export interface PriceBar {
  /** Calendar date of the trading session, YYYY-MM-DD. */
  date: string;
  close: number;
  /** Split/dividend-adjusted close, when the provider supplies one — null,
   * never estimated, when it doesn't. */
  adjClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
}

export interface MarketDataProvider {
  readonly name: string;
  /** Daily bars for [from, to], inclusive, `YYYY-MM-DD` — provider is free
   * to return fewer bars than the range implies (weekends/holidays/no data
   * that far back); it must never fabricate a bar for a date it has no
   * data for. */
  getHistoricalPrices(ticker: string, from: string, to: string): Promise<PriceBar[]>;
}
