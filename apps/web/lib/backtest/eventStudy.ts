import { growthRate } from '@/lib/analytics/ratios';
import type { PriceBarRow } from '@/lib/services/historicalPriceService';
import type { EventWindowConfig } from './backtestConfig';

/**
 * Event-study methodology (spec section 9): a simple market-adjusted
 * abnormal return, not a full market-model (beta) regression. Documented
 * explicitly here, per the spec's own "use a clearly documented
 * methodology" instruction:
 *
 *   Abnormal Return = Stock Return over the window − Benchmark Return
 *                      over the same window
 *
 * Windows are expressed in TRADING days, not calendar days — [-1,+1] means
 * "one trading day before the event's nearest bar through one trading day
 * after," found by counting actual rows in an already-fetched, ascending-
 * sorted price series, never by calendar-day arithmetic (which would
 * misalign on weekends/holidays). This module is pure — it takes bars the
 * caller already fetched, it never fetches anything itself.
 */

export interface EventWindowResult {
  windowLabel: string;
  eventDate: string;
  windowStartDate: string;
  windowEndDate: string;
  stockReturn: number | null;
  benchmarkReturn: number | null;
  /** stockReturn - benchmarkReturn. Null if either leg is unavailable —
   * never a value implying a computation that didn't actually happen. */
  abnormalReturn: number | null;
}

/** Index of the bar whose date is the nearest trading day on or before
 * `targetDate` — the same "nearest available, never a future bar"
 * convention used throughout this milestone. Returns -1 if no bar
 * qualifies (target predates the whole series). */
function nearestIndexOnOrBefore(bars: PriceBarRow[], targetDate: string): number {
  let index = -1;
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i]!.date <= targetDate) index = i;
    else break;
  }
  return index;
}

/**
 * Computes one event window's abnormal return. `stockBars`/`benchmarkBars`
 * must be sorted ascending by date and should span comfortably wider than
 * the window (the caller is responsible for fetching enough padding around
 * `eventDate`) — returns null, rather than a partial/misleading figure,
 * when the stock series doesn't have `window.preDays` bars before or
 * `window.postDays` bars after the event's own nearest bar.
 */
export function computeEventWindowReturn(stockBars: PriceBarRow[], benchmarkBars: PriceBarRow[], eventDate: string, window: EventWindowConfig): EventWindowResult | null {
  const eventIndex = nearestIndexOnOrBefore(stockBars, eventDate);
  if (eventIndex === -1) return null;

  const startIndex = eventIndex - window.preDays;
  const endIndex = eventIndex + window.postDays;
  if (startIndex < 0 || endIndex >= stockBars.length) return null;

  const startBar = stockBars[startIndex]!;
  const endBar = stockBars[endIndex]!;
  const stockReturn = growthRate(endBar.close, startBar.close);

  const benchStartIndex = nearestIndexOnOrBefore(benchmarkBars, startBar.date);
  const benchEndIndex = nearestIndexOnOrBefore(benchmarkBars, endBar.date);
  const benchmarkReturn =
    benchStartIndex === -1 || benchEndIndex === -1 ? null : growthRate(benchmarkBars[benchEndIndex]!.close, benchmarkBars[benchStartIndex]!.close);

  const abnormalReturn = stockReturn !== null && benchmarkReturn !== null ? stockReturn - benchmarkReturn : null;

  return {
    windowLabel: window.label,
    eventDate,
    windowStartDate: startBar.date,
    windowEndDate: endBar.date,
    stockReturn,
    benchmarkReturn,
    abnormalReturn,
  };
}
