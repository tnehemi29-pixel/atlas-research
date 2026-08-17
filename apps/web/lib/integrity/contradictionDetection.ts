/**
 * Milestone 14 spec section 15 — contradiction detection. Compares an
 * earlier research claim's directional statement against newer evidence
 * about the same metric; a genuine reversal is flagged as a "Potential
 * Research Contradiction" — never silently resolved, never used to delete
 * or overwrite the earlier claim. Historical research stays auditable
 * (spec: "Do not automatically delete the older claim").
 */

export type TrendDirection = 'INCREASING' | 'DECREASING' | 'STABLE';

// Below this relative move, a sequence is treated as STABLE — noise, not a
// real trend, matching the "allow for expected differences" discipline
// used throughout this milestone's other tolerance-based checks.
const DEFAULT_FLAT_THRESHOLD_PERCENT = 0.005;

/** Computes the direction of a chronologically-ordered sequence of values —
 * e.g. four consecutive quarters of operating margin — by checking whether
 * every consecutive step moves the same way. A mixed sequence (up then
 * down) is STABLE, not a coin-flip pick of one direction: an ambiguous
 * trend should never be reported as confidently directional. */
export function computeTrendDirection(values: number[], flatThresholdPercent: number = DEFAULT_FLAT_THRESHOLD_PERCENT): TrendDirection {
  if (values.length < 2) return 'STABLE';

  let sawIncrease = false;
  let sawDecrease = false;
  for (let i = 0; i < values.length - 1; i++) {
    const from = values[i]!;
    const to = values[i + 1]!;
    const threshold = Math.max(Math.abs(from), Math.abs(to)) * flatThresholdPercent;
    if (to - from > threshold) sawIncrease = true;
    else if (from - to > threshold) sawDecrease = true;
  }

  if (sawIncrease && !sawDecrease) return 'INCREASING';
  if (sawDecrease && !sawIncrease) return 'DECREASING';
  return 'STABLE';
}

export interface ContradictionCheckInput {
  metric: string;
  claimDirection: TrendDirection;
  claimDescription: string;
  claimAsOfDate: string;
  newEvidenceDirection: TrendDirection;
  newEvidenceDescription: string;
  newEvidenceAsOfDate: string;
}

export interface ContradictionFinding {
  contradicted: boolean;
  detail: string;
}

/** Only a genuine directional REVERSAL is a contradiction — new evidence
 * that's merely STABLE, or that continues the same direction, is not. */
export function detectDirectionalContradiction(input: ContradictionCheckInput): ContradictionFinding {
  const reversed =
    (input.claimDirection === 'INCREASING' && input.newEvidenceDirection === 'DECREASING') ||
    (input.claimDirection === 'DECREASING' && input.newEvidenceDirection === 'INCREASING');

  if (!reversed) {
    return { contradicted: false, detail: 'No directional reversal detected — new evidence does not conflict with the earlier claim.' };
  }

  return {
    contradicted: true,
    detail:
      `Potential research contradiction on ${input.metric}: earlier claim ("${input.claimDescription}", as of ${input.claimAsOfDate}) said ${input.claimDirection.toLowerCase()}, ` +
      `but new evidence ("${input.newEvidenceDescription}", as of ${input.newEvidenceAsOfDate}) shows ${input.newEvidenceDirection.toLowerCase()}.`,
  };
}
