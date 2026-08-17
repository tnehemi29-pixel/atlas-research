/**
 * The equity bridge: Enterprise Value -> Equity Value -> Implied Share
 * Price -> Upside/Downside vs. the current market price. Every step is
 * null-safe and requires its actual inputs — no step assumes a missing
 * value is zero.
 */

export function computeEnterpriseValue(
  pvOfForecastFcf: number | null,
  pvOfTerminalValue: number | null,
): number | null {
  if (pvOfForecastFcf === null || pvOfTerminalValue === null) return null;
  return pvOfForecastFcf + pvOfTerminalValue;
}

/** Equity Value = Enterprise Value + Cash - Total Debt. (Minority interest /
 * preferred stock are not netted out here — Atlas Research doesn't store
 * those fields yet; see the methodology page's known limitations.) */
export function computeEquityValue(
  enterpriseValue: number | null,
  cash: number | null,
  totalDebt: number | null,
): number | null {
  if (enterpriseValue === null || cash === null || totalDebt === null) return null;
  return enterpriseValue + cash - totalDebt;
}

export function computeImpliedSharePrice(
  equityValue: number | null,
  dilutedSharesOutstanding: number | null,
): number | null {
  if (equityValue === null || dilutedSharesOutstanding === null || dilutedSharesOutstanding <= 0) return null;
  return equityValue / dilutedSharesOutstanding;
}

/** (Implied Price / Current Price) - 1 — a model output, not a guaranteed
 * return; the UI is responsible for labeling it as such. */
export function computeUpsideDownside(impliedPrice: number | null, currentPrice: number | null): number | null {
  if (impliedPrice === null || currentPrice === null || currentPrice === 0) return null;
  return impliedPrice / currentPrice - 1;
}
