import type { IntegrityFinding } from './types';

/**
 * Milestone 14 spec section 16 — thesis integrity, integrating with
 * Milestone 13's Investment Cases. Compares a case's own BASE-scenario
 * growth assumption against the latest management guidance — turning
 * Milestone 11's dollar-denominated `GuidanceObservation` into a growth
 * RATE requires a baseline to compare it against, which is exactly the gap
 * Milestone 13's own Thesis Challenge Engine documented as out of scope;
 * this module closes it. A conflict is always reported as exactly that — an
 * ASSUMPTION CONFLICT — never an automatic thesis invalidation.
 */

export interface GuidanceRange {
  low: number | null;
  high: number | null;
  midpoint: number | null;
}

/** Converts dollar-denominated revenue guidance into an implied growth-rate
 * range using the prior period's actual reported revenue as the baseline.
 * Returns null when there's no baseline to divide by, or when the guidance
 * itself carries no usable figures — never a growth rate computed from a
 * missing or zero baseline. */
export function computeGuidanceImpliedGrowthRange(guidance: GuidanceRange, priorPeriodRevenue: number | null): GuidanceRange | null {
  if (priorPeriodRevenue === null || priorPeriodRevenue === 0) return null;

  const toGrowth = (value: number | null): number | null => (value === null ? null : (value - priorPeriodRevenue) / priorPeriodRevenue);
  const low = toGrowth(guidance.low);
  const high = toGrowth(guidance.high);
  const midpoint = toGrowth(guidance.midpoint);

  if (low === null && high === null && midpoint === null) return null;
  return { low, high, midpoint };
}

export interface ThesisAssumptionAuditInput {
  assumptionLabel: string;
  assumptionValue: number;
  guidanceImpliedRange: GuidanceRange | null;
  /** Percentage-point slack allowed around the guidance range before a
   * conflict is flagged — matches the tolerance discipline used throughout
   * this milestone's other checks, applied here in percentage points since
   * this compares two growth rates. */
  toleranceAbsolute?: number;
}

const DEFAULT_TOLERANCE_ABSOLUTE = 0.01; // 1 percentage point

/** Compares a single case assumption against the latest guidance-implied
 * range. Only ever produces a finding — it never writes to
 * InvestmentCaseAssumption or InvestmentCase.status; resolving a conflict
 * is always the user's own action, exactly like Milestone 13's Thesis
 * Challenge Engine. */
export function auditThesisAssumptionAgainstGuidance(input: ThesisAssumptionAuditInput): IntegrityFinding {
  const check = `Thesis assumption vs. latest guidance (${input.assumptionLabel})`;

  if (!input.guidanceImpliedRange || (input.guidanceImpliedRange.low === null && input.guidanceImpliedRange.high === null)) {
    return { check, severity: 'INFO', passed: true, message: 'Cannot verify — no guidance-implied range is available for this metric.' };
  }

  const tolerance = input.toleranceAbsolute ?? DEFAULT_TOLERANCE_ABSOLUTE;
  const low = input.guidanceImpliedRange.low ?? input.guidanceImpliedRange.midpoint;
  const high = input.guidanceImpliedRange.high ?? input.guidanceImpliedRange.midpoint;

  if (low === null || high === null) {
    return { check, severity: 'INFO', passed: true, message: 'Cannot verify — the guidance-implied range is incomplete.' };
  }

  const withinRange = input.assumptionValue >= low - tolerance && input.assumptionValue <= high + tolerance;

  return {
    check,
    severity: withinRange ? 'INFO' : 'MEDIUM',
    passed: withinRange,
    message: withinRange
      ? `Investment thesis assumption (${(input.assumptionValue * 100).toFixed(1)}%) is consistent with latest management guidance (${(low * 100).toFixed(1)}-${(high * 100).toFixed(1)}%).`
      : `ASSUMPTION CONFLICT: investment thesis assumes ${input.assumptionLabel} = ${(input.assumptionValue * 100).toFixed(1)}%, but latest management guidance implies ${(low * 100).toFixed(1)}-${(high * 100).toFixed(1)}%. This does not automatically invalidate the thesis — review is recommended.`,
  };
}
