import type { FinancialPeriodData } from '@erp/types';

/**
 * Finds the same fiscal period one year earlier — the correct "prior period"
 * for a year-over-year comparison in both annual and quarterly views.
 *
 * For annual data this is simply the previous fiscal year. For quarterly
 * data, comparing against the *immediately preceding* quarter (QoQ) would be
 * misleading for seasonal businesses — Q4 revenue dwarfing Q3 doesn't mean
 * the business is accelerating. Matching on (fiscalYear - 1, same
 * fiscalPeriod) gives Q2 2024 vs. Q2 2023, which is what "YoY growth" means
 * to an analyst regardless of period type — one function, both cases,
 * because it matches by fiscal identity rather than assuming periods are
 * contiguous (a filer can have gaps — see the verified JPMorgan
 * quarterly-revenue case in Milestone 3 — so "4 slots back" is not reliable).
 */
export function findPriorYearPeriod(
  periods: FinancialPeriodData[],
  current: FinancialPeriodData,
): FinancialPeriodData | undefined {
  return periods.find(
    (period) =>
      period.fiscalYear === current.fiscalYear - 1 && period.fiscalPeriod === current.fiscalPeriod,
  );
}

/**
 * Finds the immediately preceding period in the list (one column to the
 * right in a newest-first table) — used for ROE/ROA's average-balance
 * calculation, which wants the *adjacent* prior balance-sheet snapshot, not
 * specifically a year-over-year one (a quarterly average uses the prior
 * quarter's ending balance, not the same quarter last year).
 */
export function findAdjacentPriorPeriod(
  periods: FinancialPeriodData[],
  currentIndex: number,
): FinancialPeriodData | undefined {
  return periods[currentIndex + 1];
}

/** Same as findAdjacentPriorPeriod, but looked up by the period object
 * itself rather than a pre-known index — convenient for row builders that
 * receive (period, allPeriods) without tracking a position. */
export function findAdjacentPriorPeriodByRef(
  periods: FinancialPeriodData[],
  current: FinancialPeriodData,
): FinancialPeriodData | undefined {
  const index = periods.indexOf(current);
  return index === -1 ? undefined : periods[index + 1];
}

const YEARS_TO_PERIOD_COUNT: Record<number, number> = { 3: 3, 5: 5, 10: 10 };

export type RangeSelection = 3 | 5 | 10 | 'max';

/** Slices a newest-first period list down to a display range. Purely a
 * client-side view concern — the API already returns "up to the max we
 * store" (10 years annual / 40 quarters) in one request, so narrowing the
 * range never triggers a new fetch. */
export function sliceByRange(
  periods: FinancialPeriodData[],
  range: RangeSelection,
  periodType: 'annual' | 'quarterly',
): FinancialPeriodData[] {
  if (range === 'max') return periods;
  const years = YEARS_TO_PERIOD_COUNT[range] ?? periods.length;
  const count = periodType === 'annual' ? years : years * 4;
  return periods.slice(0, count);
}
