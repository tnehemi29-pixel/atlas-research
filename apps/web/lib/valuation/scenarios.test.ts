import { describe, expect, it } from 'vitest';
import { DEFAULT_BEAR_DELTAS, DEFAULT_BULL_DELTAS, shiftSeries } from './scenarios';

function closeToArray(values: number[]) {
  return values.map((value) => expect.closeTo(value, 9));
}

describe('shiftSeries', () => {
  it('adds a flat delta to every value', () => {
    expect(shiftSeries([0.05, 0.06, 0.07], -0.03)).toEqual(closeToArray([0.02, 0.03, 0.04]));
  });

  it('preserves null entries rather than shifting them into a fabricated number', () => {
    expect(shiftSeries([0.05, null, 0.07], -0.03)).toEqual([expect.closeTo(0.02, 9), null, expect.closeTo(0.04, 9)]);
  });

  it('works identically regardless of which forecast method produced the series', () => {
    // A 'fade' series and a 'historicalGrowth' flat series are both just
    // number arrays by the time they reach shiftSeries — no special-casing.
    const fadeSeries = [0.1, 0.08, 0.06, 0.04, 0.02];
    const flatSeries = [0.05, 0.05, 0.05, 0.05, 0.05];
    expect(shiftSeries(fadeSeries, 0.01)).toEqual(closeToArray([0.11, 0.09, 0.07, 0.05, 0.03]));
    expect(shiftSeries(flatSeries, 0.01)).toEqual(closeToArray([0.06, 0.06, 0.06, 0.06, 0.06]));
  });
});

describe('default scenario deltas', () => {
  it('bear case lowers growth and margin, and raises the equity risk premium (raising WACC)', () => {
    expect(DEFAULT_BEAR_DELTAS.revenueGrowthDelta).toBeLessThan(0);
    expect(DEFAULT_BEAR_DELTAS.marginDelta).toBeLessThan(0);
    expect(DEFAULT_BEAR_DELTAS.equityRiskPremiumDelta).toBeGreaterThan(0);
  });

  it('bull case raises growth and margin, and lowers the equity risk premium (lowering WACC)', () => {
    expect(DEFAULT_BULL_DELTAS.revenueGrowthDelta).toBeGreaterThan(0);
    expect(DEFAULT_BULL_DELTAS.marginDelta).toBeGreaterThan(0);
    expect(DEFAULT_BULL_DELTAS.equityRiskPremiumDelta).toBeLessThan(0);
  });

  it('deltas are modest, textbook-scale adjustments, not arbitrary extremes', () => {
    expect(Math.abs(DEFAULT_BEAR_DELTAS.revenueGrowthDelta)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(DEFAULT_BULL_DELTAS.revenueGrowthDelta)).toBeLessThanOrEqual(0.1);
  });
});
