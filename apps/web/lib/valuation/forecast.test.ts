import { describe, expect, it } from 'vitest';
import {
  computeForecastChangeInNwc,
  forecastDriverValues,
  forecastMargins,
  forecastNwcLevels,
  forecastRevenueGrowthRates,
  forecastTaxRate,
  projectRevenue,
} from './forecast';
import type { DriverAssumptions, MarginAssumptions, RevenueAssumptions, TaxAssumptions } from './types';

describe('forecastRevenueGrowthRates', () => {
  it('historicalGrowth repeats the historical average for every forecast year', () => {
    const assumptions: RevenueAssumptions = {
      method: 'historicalGrowth',
      userGrowthRates: [],
      fadeStartGrowth: 0,
      fadeEndGrowth: 0,
    };
    expect(forecastRevenueGrowthRates(assumptions, 3, 0.08)).toEqual([0.08, 0.08, 0.08]);
  });

  it('historicalGrowth is null for every year when no historical average exists — never a silent 0', () => {
    const assumptions: RevenueAssumptions = {
      method: 'historicalGrowth',
      userGrowthRates: [],
      fadeStartGrowth: 0,
      fadeEndGrowth: 0,
    };
    expect(forecastRevenueGrowthRates(assumptions, 3, null)).toEqual([null, null, null]);
  });

  it('userGrowth uses the exact per-year array the user provided', () => {
    const assumptions: RevenueAssumptions = {
      method: 'userGrowth',
      userGrowthRates: [0.1, 0.08, 0.06],
      fadeStartGrowth: 0,
      fadeEndGrowth: 0,
    };
    expect(forecastRevenueGrowthRates(assumptions, 3, null)).toEqual([0.1, 0.08, 0.06]);
  });

  it('userGrowth is null for any year the user left unfilled — not padded with a guess', () => {
    const assumptions: RevenueAssumptions = {
      method: 'userGrowth',
      userGrowthRates: [0.1],
      fadeStartGrowth: 0,
      fadeEndGrowth: 0,
    };
    expect(forecastRevenueGrowthRates(assumptions, 3, null)).toEqual([0.1, null, null]);
  });

  it('fade linearly interpolates from the start rate to the end rate', () => {
    const assumptions: RevenueAssumptions = {
      method: 'fade',
      userGrowthRates: [],
      fadeStartGrowth: 0.1,
      fadeEndGrowth: 0.02,
    };
    // 5 years: 0.10, 0.08, 0.06, 0.04, 0.02
    const rates = forecastRevenueGrowthRates(assumptions, 5, null);
    expect(rates[0]).toBeCloseTo(0.1);
    expect(rates[2]).toBeCloseTo(0.06);
    expect(rates[4]).toBeCloseTo(0.02);
  });
});

describe('projectRevenue', () => {
  it('compounds a base revenue forward by each growth rate', () => {
    const revenues = projectRevenue(1000, [0.1, 0.1]);
    expect(revenues[0]).toBeCloseTo(1100);
    expect(revenues[1]).toBeCloseTo(1210);
  });

  it('propagates null forward once a growth rate is unknown', () => {
    const revenues = projectRevenue(1000, [0.1, null, 0.05]);
    expect(revenues[0]).toBeCloseTo(1100);
    expect(revenues[1]).toBeNull();
    expect(revenues[2]).toBeNull(); // can't compound past a missing year
  });

  it('is entirely null when the base revenue itself is missing', () => {
    expect(projectRevenue(null, [0.1, 0.1])).toEqual([null, null]);
  });
});

describe('forecastMargins', () => {
  it('gradual linearly interpolates margin expansion or contraction', () => {
    const assumptions: MarginAssumptions = {
      method: 'gradual',
      userMargin: 0,
      gradualStartMargin: 0.2,
      gradualEndMargin: 0.24,
    };
    const margins = forecastMargins(assumptions, 5, null);
    expect(margins[0]).toBeCloseTo(0.2);
    expect(margins[4]).toBeCloseTo(0.24);
  });

  it('user applies one flat margin to every year', () => {
    const assumptions: MarginAssumptions = { method: 'user', userMargin: 0.18, gradualStartMargin: 0, gradualEndMargin: 0 };
    expect(forecastMargins(assumptions, 3, null)).toEqual([0.18, 0.18, 0.18]);
  });
});

describe('forecastTaxRate', () => {
  it('user overrides the historical rate', () => {
    const assumptions: TaxAssumptions = { method: 'user', userRate: 0.25 };
    expect(forecastTaxRate(assumptions, 0.19)).toBe(0.25);
  });

  it('historical uses the supplied historical average, or null if unavailable', () => {
    const assumptions: TaxAssumptions = { method: 'historical', userRate: 0 };
    expect(forecastTaxRate(assumptions, 0.19)).toBe(0.19);
    expect(forecastTaxRate(assumptions, null)).toBeNull();
  });
});

describe('D&A / CapEx driver forecasting', () => {
  const revenues = [1000, 1100, 1210];

  it('historicalAverage scales by the computed historical percent of revenue', () => {
    const assumptions: DriverAssumptions = { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 };
    expect(forecastDriverValues(assumptions, revenues, 0.05)).toEqual([50, 55, 60.5]);
  });

  it('percentOfRevenue scales by the user-provided percent', () => {
    const assumptions: DriverAssumptions = { method: 'percentOfRevenue', percentOfRevenue: 0.1, flatAmount: 0 };
    expect(forecastDriverValues(assumptions, revenues, null)).toEqual([100, 110, 121]);
  });

  it('flatAmount ignores revenue entirely and repeats the same dollar figure', () => {
    const assumptions: DriverAssumptions = { method: 'flatAmount', percentOfRevenue: 0, flatAmount: 75 };
    expect(forecastDriverValues(assumptions, revenues, 0.05)).toEqual([75, 75, 75]);
  });

  it('historicalAverage is null across the board when no historical percent exists', () => {
    const assumptions: DriverAssumptions = { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 };
    expect(forecastDriverValues(assumptions, revenues, null)).toEqual([null, null, null]);
  });
});

describe('NWC level forecasting and change-in-NWC', () => {
  it('forecasts NWC level as percent of revenue, then diffs against the prior level', () => {
    const assumptions: DriverAssumptions = { method: 'percentOfRevenue', percentOfRevenue: 0.15, flatAmount: 0 };
    const revenues = [1000, 1100];
    const levels = forecastNwcLevels(assumptions, revenues, null);
    expect(levels).toEqual([150, 165]);

    const changes = computeForecastChangeInNwc(levels, 140); // last historical NWC = 140
    expect(changes[0]).toBeCloseTo(10); // 150 - 140
    expect(changes[1]).toBeCloseTo(15); // 165 - 150
  });

  it('is null only for the specific year with no known prior level — later years still compute from the now-known levels', () => {
    const changes = computeForecastChangeInNwc([150, 165], null);
    expect(changes[0]).toBeNull(); // no historical baseline to diff year 1 against
    expect(changes[1]).toBeCloseTo(15); // but year1 -> year2 (150 -> 165) is still computable
  });
});
