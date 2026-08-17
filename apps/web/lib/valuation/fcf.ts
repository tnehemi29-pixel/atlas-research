/**
 * The one formula every FCF figure in the DCF — historical or forecast —
 * runs through:
 *
 *   EBIT
 *   - Taxes on EBIT      (EBIT * taxRate)
 *   = NOPAT
 *   + D&A
 *   - CapEx              (a positive magnitude, always subtracted)
 *   - Change in NWC       (an increase in NWC is a use of cash, so it's subtracted)
 *   = Unlevered Free Cash Flow
 *
 * Deliberately never starts from net income — net income already reflects
 * interest expense (a financing item) and this is a firm-level, unlevered
 * cash flow used to value the whole enterprise, not just the equity.
 */

export function computeNopat(ebit: number | null, taxRate: number | null): number | null {
  if (ebit === null || taxRate === null) return null;
  return ebit * (1 - taxRate);
}

export function computeUnleveredFcf(
  nopat: number | null,
  da: number | null,
  capex: number | null,
  changeInNwc: number | null,
): number | null {
  if (nopat === null || da === null || capex === null || changeInNwc === null) return null;
  return nopat + da - capex - changeInNwc;
}

/** Convenience wrapper: EBIT + tax rate straight through to unlevered FCF. */
export function computeUnleveredFcfFromEbit(
  ebit: number | null,
  taxRate: number | null,
  da: number | null,
  capex: number | null,
  changeInNwc: number | null,
): number | null {
  return computeUnleveredFcf(computeNopat(ebit, taxRate), da, capex, changeInNwc);
}
