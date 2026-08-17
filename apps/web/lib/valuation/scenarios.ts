/**
 * Bear/Base/Bull scenarios are expressed as *deltas* applied to the Base
 * case's already-resolved, per-year growth and margin figures — not as a
 * separate assumption-method for each scenario. That means a delta applies
 * identically no matter which forecasting method the user chose for the
 * base case (historical average, fade, fully custom), and shifting the
 * equity risk premium (rather than overwriting WACC directly) keeps the
 * bear/bull WACC auditable through the same cost-of-equity formula as the
 * base case, instead of becoming an unexplained override.
 *
 * These starting deltas are deliberately modest, common textbook-style
 * adjustments (not arbitrary extremes) and are fully user-editable in the
 * UI — see ScenarioPanel.
 */

export interface ScenarioDeltas {
  /** Added to every forecast year's resolved revenue growth rate. */
  revenueGrowthDelta: number;
  /** Added to every forecast year's resolved EBIT margin. */
  marginDelta: number;
  /** Added to the equity risk premium input, cascading through cost of equity into WACC. */
  equityRiskPremiumDelta: number;
}

export const DEFAULT_BEAR_DELTAS: ScenarioDeltas = {
  revenueGrowthDelta: -0.03,
  marginDelta: -0.02,
  equityRiskPremiumDelta: 0.015,
};

export const DEFAULT_BULL_DELTAS: ScenarioDeltas = {
  revenueGrowthDelta: 0.03,
  marginDelta: 0.02,
  equityRiskPremiumDelta: -0.01,
};

/** Shifts every non-null value in a resolved series by a flat delta —
 * applied to growth-rate and margin arrays regardless of which forecast
 * method produced them. */
export function shiftSeries(values: Array<number | null>, delta: number): Array<number | null> {
  return values.map((value) => (value === null ? null : value + delta));
}
