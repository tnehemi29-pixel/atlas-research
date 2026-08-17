/**
 * Provenance and validation primitives shared by every calculation engine in
 * the app (lib/valuation/ — Milestone 5's DCF engine — and lib/comps/ —
 * Milestone 6's comparable-company engine). Extracted here so both engines
 * tag "actual company data" vs. "a value we calculated" vs. "a number the
 * user typed in" identically, rather than each engine inventing its own
 * provenance convention.
 *
 * `lib/valuation/types.ts` re-exports these from the same names it always
 * has, so this extraction is purely additive — no existing import in
 * lib/valuation/ or its ~15 test files needed to change.
 */

export type AssumptionSource = 'actual' | 'estimate' | 'calculated' | 'user';

export interface Tagged<T> {
  value: T;
  source: AssumptionSource;
  /** Short provenance note shown in the UI, e.g. "5-yr historical average" or "FMP profile". */
  note?: string;
}

export function tag<T>(value: T, source: AssumptionSource, note?: string): Tagged<T> {
  return note === undefined ? { value, source } : { value, source, note };
}

export type ValidationSeverity = 'ERROR' | 'WARNING';

export interface ValidationIssue {
  severity: ValidationSeverity;
  field: string;
  message: string;
}
