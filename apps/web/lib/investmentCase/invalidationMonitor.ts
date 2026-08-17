import type { InvalidationComparator, InvestmentAssumptionMetric } from '@prisma/client';

/**
 * Spec section 11 — user-defined invalidation criteria. This module only
 * ever computes an ADVISORY "potentially met" read against live data; it
 * never writes InvestmentCaseInvalidationCriterion.status and never touches
 * InvestmentCase.status. Turning a "potentially met" evaluation into a
 * confirmed, stored decision is always a separate, explicit user action
 * (PATCHing the criterion or completing a review) — see
 * lib/services/investmentCaseChallengeService.ts.
 */

function compareValue(value: number, comparator: InvalidationComparator, threshold: number): boolean {
  switch (comparator) {
    case 'LESS_THAN':
      return value < threshold;
    case 'LESS_THAN_OR_EQUAL':
      return value <= threshold;
    case 'GREATER_THAN':
      return value > threshold;
    case 'GREATER_THAN_OR_EQUAL':
      return value >= threshold;
  }
}

function comparatorLabel(comparator: InvalidationComparator): string {
  switch (comparator) {
    case 'LESS_THAN':
      return 'is below';
    case 'LESS_THAN_OR_EQUAL':
      return 'is at or below';
    case 'GREATER_THAN':
      return 'is above';
    case 'GREATER_THAN_OR_EQUAL':
      return 'is at or above';
  }
}

export interface InvalidationCheckInput {
  criterionId: string;
  description: string;
  metric: InvestmentAssumptionMetric | null;
  comparator: InvalidationComparator | null;
  thresholdValue: number | null;
  thresholdUnit: string | null;
  consecutivePeriods: number | null;
  /** Ascending chronological order, most recent value last. Empty when no
   * live data could be resolved for this metric at all. */
  recentValues: number[];
}

export interface InvalidationEvaluation {
  criterionId: string;
  description: string;
  /** False for a purely qualitative criterion (no metric/comparator/
   * threshold defined) — can only ever be reviewed manually. */
  checkable: boolean;
  potentiallyMet: boolean;
  latestValue: number | null;
  thresholdValue: number | null;
  comparator: InvalidationComparator | null;
  reason: string;
}

export function evaluateInvalidationCriterion(input: InvalidationCheckInput): InvalidationEvaluation {
  const base = { criterionId: input.criterionId, description: input.description, thresholdValue: input.thresholdValue, comparator: input.comparator };

  if (input.metric === null || input.comparator === null || input.thresholdValue === null) {
    return { ...base, checkable: false, potentiallyMet: false, latestValue: null, reason: 'This criterion is qualitative and has no metric/threshold defined — it can only be reviewed manually.' };
  }

  if (input.recentValues.length === 0) {
    return { ...base, checkable: true, potentiallyMet: false, latestValue: null, reason: 'No live data is currently available for this metric.' };
  }

  const requiredPeriods = input.consecutivePeriods ?? 1;
  const latestValue = input.recentValues[input.recentValues.length - 1]!;

  if (input.recentValues.length < requiredPeriods) {
    return {
      ...base,
      checkable: true,
      potentiallyMet: false,
      latestValue,
      reason: `This criterion requires ${requiredPeriods} consecutive period(s) of data, but only ${input.recentValues.length} are available yet.`,
    };
  }

  const window = input.recentValues.slice(input.recentValues.length - requiredPeriods);
  const potentiallyMet = window.every((v) => compareValue(v, input.comparator!, input.thresholdValue!));

  const periodPhrase = requiredPeriods > 1 ? `for the last ${requiredPeriods} consecutive periods` : 'currently';
  const reason = potentiallyMet
    ? `The live value ${periodPhrase} ${comparatorLabel(input.comparator)} the threshold of ${input.thresholdValue}${input.thresholdUnit ? ` ${input.thresholdUnit}` : ''} — potentially met. This does NOT automatically invalidate the thesis; user confirmation is required.`
    : `The live value does not currently meet this criterion's threshold.`;

  return { ...base, checkable: true, potentiallyMet, latestValue, reason };
}

export function evaluateInvalidationCriteria(inputs: InvalidationCheckInput[]): InvalidationEvaluation[] {
  return inputs.map(evaluateInvalidationCriterion);
}
