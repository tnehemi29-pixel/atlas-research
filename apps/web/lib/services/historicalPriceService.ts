import { db } from '@/lib/db';
import { ensureCompanyByTicker } from '@/lib/services/companyService';
import { fmpMarketDataProvider } from '@/lib/providers/marketData/fmpMarketData';
import type { MarketDataProvider } from '@/lib/providers/marketData/types';
import { growthRate } from '@/lib/analytics/ratios';

/**
 * The historical-price cache — Milestone 12's answer to "store or cache
 * historical data efficiently" and "do not make the system dependent on a
 * single data provider." Every caller (point-in-time valuation, event
 * studies, financial-signal/valuation-spread validation) goes through this
 * file, never through lib/providers/marketData/ directly, so swapping or
 * adding a second provider never touches calling code.
 *
 * Caching strategy: for a given company, track only the min/max cached
 * date and backfill whichever side (earlier, later, or both) a request
 * extends beyond — a provider naturally omits weekend/holiday rows, so
 * "covered" means "we've fetched this calendar span at least once," not
 * "every calendar day has a row." A provider failure (rate limit, not
 * configured, network) never throws here — every function degrades to
 * whatever is already cached, exactly like every other Atlas provider
 * integration (financialDataService, companyService, etc.).
 */

const provider: MarketDataProvider = fmpMarketDataProvider;

export interface PriceBarRow {
  date: string;
  close: number;
  adjClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
}

/** Normalizes any ISO-ish date string — a plain "YYYY-MM-DD", or a full
 * timestamp like FinancialPeriodData.filingDate stores (financialDataService.ts
 * returns `filingDate.toISOString()`) — to its "YYYY-MM-DD" date-only form,
 * the one convention every point-in-time function in this milestone compares
 * and arithmetic-shifts on. A no-op on an already-date-only string. */
export function toDateOnly(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function parseDateOnly(dateStr: string): Date {
  return new Date(`${toDateOnly(dateStr)}T00:00:00.000Z`);
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Exported for lib/services/backtestService.ts's event-study padding
 * (fetching enough calendar span around an event date to guarantee the
 * trading-day window it needs). */
export function addDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnly(d);
}

/** Calendar-month addition (not 30-day approximation) — matches how
 * "1M/3M/6M/12M horizon" is naturally understood by an analyst. */
export function addMonths(dateStr: string, months: number): string {
  const d = parseDateOnly(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return formatDateOnly(d);
}

async function fetchAndStore(companyId: string, ticker: string, from: string, to: string): Promise<void> {
  if (from > to) return;
  let bars;
  try {
    bars = await provider.getHistoricalPrices(ticker, from, to);
  } catch {
    // Provider unavailable — the caller falls back to whatever is already
    // cached rather than failing the whole analysis.
    return;
  }
  if (bars.length === 0) return;

  await db.historicalPriceBar.createMany({
    data: bars.map((bar) => ({
      companyId,
      date: parseDateOnly(bar.date),
      close: bar.close,
      adjClose: bar.adjClose,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      volume: bar.volume,
      source: provider.name,
    })),
    skipDuplicates: true,
  });
}

/**
 * Coverage is inferred from the min/max date of stored bars, not tracked as
 * its own record — simple, and correct in the common case, but it means a
 * request whose edges land on non-trading days right at the boundary of an
 * already-fetched span can trigger one redundant provider re-fetch of a
 * span already confirmed empty. `skipDuplicates` on the insert makes this
 * harmless (never duplicate or incorrect rows, only an occasional extra
 * provider call) — documented here rather than solved with a separate
 * coverage-tracking table, which would be new complexity for a
 * correctness-neutral efficiency edge case.
 */
async function ensureCachedRange(companyId: string, ticker: string, from: string, to: string): Promise<void> {
  const existing = await db.historicalPriceBar.aggregate({ where: { companyId }, _min: { date: true }, _max: { date: true } });

  if (!existing._min.date || !existing._max.date) {
    await fetchAndStore(companyId, ticker, from, to);
    return;
  }

  const minCached = formatDateOnly(existing._min.date);
  const maxCached = formatDateOnly(existing._max.date);

  if (from < minCached) {
    await fetchAndStore(companyId, ticker, from, addDays(minCached, -1));
  }
  if (to > maxCached) {
    await fetchAndStore(companyId, ticker, addDays(maxCached, 1), to);
  }
}

function toRow(bar: { date: Date; close: number; adjClose: number | null; open: number | null; high: number | null; low: number | null; volume: number | null }): PriceBarRow {
  return { date: formatDateOnly(bar.date), close: bar.close, adjClose: bar.adjClose, open: bar.open, high: bar.high, low: bar.low, volume: bar.volume };
}

/** Every daily bar cached for [from, to] (inclusive, `YYYY-MM-DD`),
 * backfilling from the provider first if the cache doesn't yet cover the
 * requested span. */
export async function getHistoricalPrices(rawTicker: string, from: string, to: string): Promise<PriceBarRow[]> {
  const company = await ensureCompanyByTicker(rawTicker);
  await ensureCachedRange(company.id, company.ticker, from, to);

  const rows = await db.historicalPriceBar.findMany({
    where: { companyId: company.id, date: { gte: parseDateOnly(from), lte: parseDateOnly(to) } },
    orderBy: { date: 'asc' },
  });
  return rows.map(toRow);
}

/** The most recent trading-day close on or before `asOfDate` — the
 * building block every look-ahead-safe calculation in this milestone uses
 * ("the price an analyst could actually have observed on this date").
 * Looks back up to 10 calendar days to cross a holiday cluster; returns
 * null only when genuinely nothing is available (never a fabricated
 * price). */
export async function getPriceAsOf(rawTicker: string, asOfDate: string): Promise<{ date: string; close: number } | null> {
  const company = await ensureCompanyByTicker(rawTicker);
  const lookbackFrom = addDays(asOfDate, -10);
  await ensureCachedRange(company.id, company.ticker, lookbackFrom, asOfDate);

  const bar = await db.historicalPriceBar.findFirst({
    where: { companyId: company.id, date: { lte: parseDateOnly(asOfDate) } },
    orderBy: { date: 'desc' },
  });
  return bar ? { date: formatDateOnly(bar.date), close: bar.close } : null;
}

export interface ForwardReturn {
  fromDate: string;
  fromPrice: number;
  toDate: string;
  toPrice: number;
  /** (toPrice / fromPrice) - 1, via lib/analytics/ratios.ts's shared convention. */
  returnPct: number;
}

/** The forward return from `fromDate` to `fromDate + horizonMonths`
 * calendar months. Returns null — never a stale reused price — when the
 * horizon hasn't actually elapsed yet in the available price history (the
 * nearest bar on/before the target date is the same bar as the starting
 * point, meaning no new trading data exists past `fromDate`). */
export async function getForwardReturn(rawTicker: string, fromDate: string, horizonMonths: number): Promise<ForwardReturn | null> {
  const fromBar = await getPriceAsOf(rawTicker, fromDate);
  if (!fromBar) return null;

  const targetDate = addMonths(fromDate, horizonMonths);
  const toBar = await getPriceAsOf(rawTicker, targetDate);
  if (!toBar || toBar.date <= fromBar.date) return null;

  const returnPct = growthRate(toBar.close, fromBar.close);
  if (returnPct === null) return null;

  return { fromDate: fromBar.date, fromPrice: fromBar.close, toDate: toBar.date, toPrice: toBar.close, returnPct };
}
