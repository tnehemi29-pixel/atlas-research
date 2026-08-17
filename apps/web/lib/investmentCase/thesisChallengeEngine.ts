import type { InvestmentAssumptionMetric } from '@prisma/client';
import { computeChange } from '@/lib/researchEvents/changeDetection';

/**
 * Spec section 10 — a deterministic system that flags when new evidence
 * conflicts with a thesis's own assumptions. Every output is a "Potential
 * Challenge," never "Thesis Broken": this module only ever reads a stored
 * assumption and a live value and reports the gap — it never writes to the
 * assumption, never changes InvestmentCase.status, and never decides
 * anything on the user's behalf.
 *
 * Ratio-shaped assumptions (growth rates, margins, WACC, terminal growth)
 * are compared in PERCENTAGE POINTS — matching the spec's own worked
 * example ("Revenue growth = 15% vs. guidance 9-11% -> Difference: -4 to -6
 * percentage points"), which is a plain subtraction of two already-ratio
 * values, exactly `computeChange()`'s own `changeAbsolute` field. Multiple/
 * count/dollar-shaped assumptions (exit multiple, debt, share count) are
 * instead compared as a RELATIVE percent change, since "the multiple moved
 * 2 points" and "the multiple moved 2x" mean very different things —
 * `computeChange()`'s `changePercent` field, reused unchanged from
 * Milestone 11 rather than a second diff formula invented for this module.
 */

const RATIO_METRICS: ReadonlySet<InvestmentAssumptionMetric> = new Set([
  'REVENUE_GROWTH',
  'REVENUE_CAGR',
  'OPERATING_MARGIN',
  'FCF_MARGIN',
  'WACC',
  'TERMINAL_GROWTH',
  'EPS_GROWTH',
]);

/** Below this magnitude, a gap is treated as normal noise, not a challenge
 * worth surfacing — documented per metric so "why did this fire" is always
 * answerable, never a hidden number. Ratio metrics: percentage points.
 * Non-ratio metrics: relative percent change. */
export const CHALLENGE_THRESHOLDS: Record<InvestmentAssumptionMetric, number> = {
  REVENUE_GROWTH: 0.02,
  REVENUE_CAGR: 0.02,
  OPERATING_MARGIN: 0.02,
  FCF_MARGIN: 0.02,
  WACC: 0.01,
  TERMINAL_GROWTH: 0.005,
  EPS_GROWTH: 0.03,
  EXIT_MULTIPLE: 0.1,
  DEBT: 0.15,
  SHARE_COUNT: 0.05,
};

export type ChallengeDifferenceKind = 'PERCENTAGE_POINTS' | 'RELATIVE_PERCENT';

export interface AssumptionChallengeInput {
  metric: InvestmentAssumptionMetric;
  label: string;
  assumptionValue: number;
  unit: string;
  liveValue: number;
  /** Where the live value came from — e.g. "Latest earnings-call guidance",
   * "Current DCF Base case" — always required, never a bare number with no
   * traceable origin. */
  source: string;
  affectedAreas: string[];
}

export interface ThesisChallenge {
  trigger: string;
  metric: InvestmentAssumptionMetric;
  label: string;
  thesisAssumption: number;
  currentValue: number;
  unit: string;
  difference: number;
  differenceKind: ChallengeDifferenceKind;
  affectedAreas: string[];
  source: string;
}

/** Returns null when the gap doesn't clear this metric's own threshold —
 * "no challenge" is the common case, not an edge case to special-case away. */
export function evaluateAssumptionChallenge(input: AssumptionChallengeInput): ThesisChallenge | null {
  const isRatio = RATIO_METRICS.has(input.metric);
  const change = computeChange(input.assumptionValue, input.liveValue);
  const difference = isRatio ? change.changeAbsolute : change.changePercent;
  if (difference === null) return null;

  const threshold = CHALLENGE_THRESHOLDS[input.metric];
  if (Math.abs(difference) < threshold) return null;

  const differenceKind: ChallengeDifferenceKind = isRatio ? 'PERCENTAGE_POINTS' : 'RELATIVE_PERCENT';
  return {
    trigger: `${input.label} moved from an assumed ${input.assumptionValue} to a live ${input.liveValue} (${input.source}).`,
    metric: input.metric,
    label: input.label,
    thesisAssumption: input.assumptionValue,
    currentValue: input.liveValue,
    unit: input.unit,
    difference,
    differenceKind,
    affectedAreas: input.affectedAreas,
    source: input.source,
  };
}

/** Evaluates a whole set of assumptions against their live counterparts —
 * inputs missing a live value are simply omitted by the caller before this
 * is called (never a fabricated comparison). */
export function evaluateThesisChallenges(inputs: AssumptionChallengeInput[]): ThesisChallenge[] {
  return inputs.map(evaluateAssumptionChallenge).filter((c): c is ThesisChallenge => c !== null);
}
