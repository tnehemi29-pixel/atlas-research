/**
 * Standard end-of-year discounting: discount factor for year t = 1 / (1+WACC)^t.
 * Deliberately not mid-year convention — see the methodology page for why
 * that's a documented simplification rather than a hidden one.
 */
export function discountFactor(wacc: number | null, yearIndex: number): number | null {
  if (wacc === null) return null;
  const base = 1 + wacc;
  if (base <= 0) return null; // WACC <= -100% is nonsensical, not a real discount rate
  return 1 / Math.pow(base, yearIndex);
}

export function presentValue(cashFlow: number | null, factor: number | null): number | null {
  if (cashFlow === null || factor === null) return null;
  return cashFlow * factor;
}

/** Sums a series of present values — null if any single year's PV is
 * unknown, since a partial sum would misrepresent the total. */
export function sumPresentValues(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return (values as number[]).reduce((total, value) => total + value, 0);
}
