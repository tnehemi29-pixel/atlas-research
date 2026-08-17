/**
 * Two terminal value methodologies, plus a cross-check formula for each so
 * a user can sanity-check one method's output against the other's implied
 * assumption — a standard banker's habit, and a direct auditability aid.
 */

/** TV = FCF_(n+1) / (WACC - g), where FCF_(n+1) = FCF_n * (1+g).
 * Requires WACC > g — an invalid combination returns null; callers should
 * also surface this through lib/valuation/validate.ts before computing. */
export function perpetuityGrowthTerminalValue(
  finalYearFcf: number | null,
  wacc: number | null,
  terminalGrowthRate: number,
): number | null {
  if (finalYearFcf === null || wacc === null) return null;
  if (wacc <= terminalGrowthRate) return null;

  const nextYearFcf = finalYearFcf * (1 + terminalGrowthRate);
  return nextYearFcf / (wacc - terminalGrowthRate);
}

/** TV = Terminal EBITDA * Exit EV/EBITDA multiple, where EBITDA = EBIT + D&A. */
export function exitMultipleTerminalValue(
  finalYearEbit: number | null,
  finalYearDa: number | null,
  exitMultiple: number,
): number | null {
  if (finalYearEbit === null || finalYearDa === null) return null;
  const ebitda = finalYearEbit + finalYearDa;
  return ebitda * exitMultiple;
}

/** Cross-check: if the perpetuity-growth TV were instead expressed as an
 * EV/EBITDA multiple, what multiple would that imply? */
export function impliedExitMultiple(
  terminalValue: number | null,
  finalYearEbit: number | null,
  finalYearDa: number | null,
): number | null {
  if (terminalValue === null || finalYearEbit === null || finalYearDa === null) return null;
  const ebitda = finalYearEbit + finalYearDa;
  if (ebitda === 0) return null;
  return terminalValue / ebitda;
}

/** Cross-check: if the exit-multiple TV were instead expressed as a
 * perpetuity growth rate, what rate would that imply? Solved algebraically
 * from TV = FCF*(1+g)/(WACC-g):  g = (TV*WACC - FCF) / (TV + FCF). */
export function impliedPerpetuityGrowthRate(
  terminalValue: number | null,
  finalYearFcf: number | null,
  wacc: number | null,
): number | null {
  if (terminalValue === null || finalYearFcf === null || wacc === null) return null;
  const denominator = terminalValue + finalYearFcf;
  if (denominator === 0) return null;
  return (terminalValue * wacc - finalYearFcf) / denominator;
}
