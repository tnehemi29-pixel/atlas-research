import type { DriverAssumptions, MarginAssumptions, RevenueAssumptions, TaxAssumptions } from './types';

/**
 * Every forecast function here takes an explicit historical reference value
 * and never invents one. If a 'historical*' method is selected and the
 * historical figure is unavailable (a young company, sparse data), the
 * result is null for every forecast year — never a silent 0 — and the
 * caller (engine.ts) surfaces that as a validation issue asking the user to
 * either supply history or switch methods.
 */

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

export function forecastRevenueGrowthRates(
  assumptions: RevenueAssumptions,
  forecastYears: number,
  historicalAverageGrowth: number | null,
): Array<number | null> {
  switch (assumptions.method) {
    case 'historicalGrowth':
      return Array.from({ length: forecastYears }, () => historicalAverageGrowth);

    case 'userGrowth':
      return Array.from({ length: forecastYears }, (_, i) => assumptions.userGrowthRates[i] ?? null);

    case 'fade':
      return Array.from({ length: forecastYears }, (_, i) => {
        if (forecastYears === 1) return assumptions.fadeStartGrowth;
        const t = i / (forecastYears - 1);
        return assumptions.fadeStartGrowth + (assumptions.fadeEndGrowth - assumptions.fadeStartGrowth) * t;
      });
  }
}

/** Compounds a base revenue forward by a sequence of growth rates. Returns
 * null for a year (and every year after it) once a null growth rate appears —
 * an unknown growth rate can't be compounded through. */
export function projectRevenue(baseRevenue: number | null, growthRates: Array<number | null>): Array<number | null> {
  const result: Array<number | null> = [];
  let current = baseRevenue;
  for (const rate of growthRates) {
    current = current !== null && rate !== null ? current * (1 + rate) : null;
    result.push(current);
  }
  return result;
}

// ---------------------------------------------------------------------------
// EBIT margin
// ---------------------------------------------------------------------------

export function forecastMargins(
  assumptions: MarginAssumptions,
  forecastYears: number,
  historicalAverageMargin: number | null,
): Array<number | null> {
  switch (assumptions.method) {
    case 'historicalAverage':
      return Array.from({ length: forecastYears }, () => historicalAverageMargin);

    case 'user':
      return Array.from({ length: forecastYears }, () => assumptions.userMargin);

    case 'gradual':
      return Array.from({ length: forecastYears }, (_, i) => {
        if (forecastYears === 1) return assumptions.gradualStartMargin;
        const t = i / (forecastYears - 1);
        return assumptions.gradualStartMargin + (assumptions.gradualEndMargin - assumptions.gradualStartMargin) * t;
      });
  }
}

// ---------------------------------------------------------------------------
// Tax rate — a single flat rate applied across the forecast (a company's
// long-term effective rate is modeled as a target steady-state, not faded).
// ---------------------------------------------------------------------------

export function forecastTaxRate(assumptions: TaxAssumptions, historicalAverageTaxRate: number | null): number | null {
  return assumptions.method === 'user' ? assumptions.userRate : historicalAverageTaxRate;
}

// ---------------------------------------------------------------------------
// D&A / CapEx / NWC drivers — shared 3-method model, see types.ts's
// DriverMethod doc comment for what each method means.
// ---------------------------------------------------------------------------

function resolveDriverPercent(assumptions: DriverAssumptions, historicalAveragePercent: number | null): number | null {
  switch (assumptions.method) {
    case 'historicalAverage':
      return historicalAveragePercent;
    case 'percentOfRevenue':
      return assumptions.percentOfRevenue;
    case 'flatAmount':
      return null; // flat-amount driver isn't %-of-revenue at all
  }
}

/** D&A / CapEx: a dollar figure per forecast year. */
export function forecastDriverValues(
  assumptions: DriverAssumptions,
  forecastRevenues: Array<number | null>,
  historicalAveragePercent: number | null,
): Array<number | null> {
  if (assumptions.method === 'flatAmount') {
    return forecastRevenues.map(() => assumptions.flatAmount);
  }

  const percent = resolveDriverPercent(assumptions, historicalAveragePercent);
  if (percent === null) return forecastRevenues.map(() => null);
  return forecastRevenues.map((revenue) => (revenue === null ? null : revenue * percent));
}

/** NWC level per forecast year (same driver model as D&A/CapEx, applied to
 * the balance-sheet level rather than a flow). */
export function forecastNwcLevels(
  assumptions: DriverAssumptions,
  forecastRevenues: Array<number | null>,
  historicalAveragePercent: number | null,
): Array<number | null> {
  return forecastDriverValues(assumptions, forecastRevenues, historicalAveragePercent);
}

/** Change in NWC = this year's level minus last year's — the first forecast
 * year diffs against the final historical NWC level. Documented formula:
 * ΔNWC(t) = NWC(t) - NWC(t-1), where NWC(0) is the last historical level. */
export function computeForecastChangeInNwc(
  levels: Array<number | null>,
  lastHistoricalNwc: number | null,
): Array<number | null> {
  const result: Array<number | null> = [];
  let prior = lastHistoricalNwc;
  for (const level of levels) {
    result.push(level !== null && prior !== null ? level - prior : null);
    prior = level;
  }
  return result;
}
