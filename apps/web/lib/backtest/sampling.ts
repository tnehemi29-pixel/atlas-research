/**
 * Generates the calendar dates a backtest samples along a date range.
 * Pure, no I/O — lib/services/backtestService.ts calls this once per
 * analysis, then runs a point-in-time computation at each returned date.
 *
 * Monthly (first-of-month) sampling is the default granularity — fine
 * enough to see how a valuation gap evolved, coarse enough to keep the
 * number of point-in-time DCF/price computations bounded. `maxSamples`
 * caps the total regardless of range width (a 20-year monthly request
 * would otherwise generate 240 point-in-time DCF runs in one HTTP
 * request) — capped, not silently truncated: callers should surface
 * `wasCapped` so a user asking for a huge range knows the result covers
 * only its first `maxSamples` months, not the full span.
 */

export interface SampleDatesResult {
  dates: string[];
  wasCapped: boolean;
}

export function generateMonthlySampleDates(fromDate: string, toDate: string, maxSamples = 120): SampleDatesResult {
  const dates: string[] = [];
  let year = Number.parseInt(fromDate.slice(0, 4), 10);
  let month = Number.parseInt(fromDate.slice(5, 7), 10);
  const toDateNum = toDate;

  while (dates.length < maxSamples) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    if (dateStr > toDateNum) break;
    dates.push(dateStr);

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const nextDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const wasCapped = dates.length === maxSamples && nextDateStr <= toDateNum;

  return { dates, wasCapped };
}
