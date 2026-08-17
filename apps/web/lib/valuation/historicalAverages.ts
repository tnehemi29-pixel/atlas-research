import { safeDivide } from '@/lib/analytics/ratios';
import type { HistoricalYear } from './types';

export interface HistoricalAverages {
  growth: number | null;
  margin: number | null;
  taxRate: number | null;
  daPercent: number | null;
  capexPercent: number | null;
  nwcPercent: number | null;
}

function averageNonNull(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((total, value) => total + value, 0) / present.length;
}

/**
 * The single source of truth for every "historical average" figure — used
 * both by the forecast engine (as the reference value for the
 * 'historicalGrowth'/'historicalAverage' methods) and by the Forecast
 * Assumptions panel (to show the user what that average actually is next to
 * the method selector). Computed once here so the displayed number can never
 * drift from the number the engine forecasts with.
 */
export function computeHistoricalAverages(historicals: HistoricalYear[]): HistoricalAverages {
  return {
    growth: averageNonNull(historicals.map((year) => year.revenueGrowth)),
    margin: averageNonNull(historicals.map((year) => year.ebitMargin)),
    taxRate: averageNonNull(historicals.map((year) => year.taxRate)),
    daPercent: averageNonNull(historicals.map((year) => safeDivide(year.da, year.revenue))),
    capexPercent: averageNonNull(historicals.map((year) => safeDivide(year.capex, year.revenue))),
    nwcPercent: averageNonNull(historicals.map((year) => safeDivide(year.nwc, year.revenue))),
  };
}
