import { describe, expect, it } from 'vitest';
import { evaluateInvalidationCriterion } from './invalidationMonitor';

describe('evaluateInvalidationCriterion', () => {
  it('is not checkable when no metric/comparator/threshold is defined (purely qualitative)', () => {
    const result = evaluateInvalidationCriterion({
      criterionId: 'c1',
      description: 'Major product launch fails.',
      metric: null,
      comparator: null,
      thresholdValue: null,
      thresholdUnit: null,
      consecutivePeriods: null,
      recentValues: [],
    });
    expect(result.checkable).toBe(false);
    expect(result.potentiallyMet).toBe(false);
  });

  it('matches the spec worked example: DCF implied value falls below $75', () => {
    const result = evaluateInvalidationCriterion({
      criterionId: 'c2',
      description: 'DCF implied value falls below $75.',
      metric: 'WACC', // metric field isn't used for display math here, just gating checkability
      comparator: 'LESS_THAN',
      thresholdValue: 75,
      thresholdUnit: 'usd',
      consecutivePeriods: null,
      recentValues: [70],
    });
    expect(result.checkable).toBe(true);
    expect(result.potentiallyMet).toBe(true);
    expect(result.reason).toContain('potentially met');
    expect(result.reason.toLowerCase()).not.toContain('invalidated');
  });

  it('never fires early when it does not meet threshold', () => {
    const result = evaluateInvalidationCriterion({
      criterionId: 'c3',
      description: 'DCF implied value falls below $75.',
      metric: 'WACC',
      comparator: 'LESS_THAN',
      thresholdValue: 75,
      thresholdUnit: 'usd',
      consecutivePeriods: null,
      recentValues: [80],
    });
    expect(result.potentiallyMet).toBe(false);
  });

  it('requires ALL of N consecutive periods to satisfy the comparator (e.g. revenue growth below 8% for 3 consecutive quarters)', () => {
    const met = evaluateInvalidationCriterion({
      criterionId: 'c4',
      description: 'Revenue growth remains below 8% for 3 consecutive quarters.',
      metric: 'REVENUE_GROWTH',
      comparator: 'LESS_THAN',
      thresholdValue: 0.08,
      thresholdUnit: 'ratio',
      consecutivePeriods: 3,
      recentValues: [0.09, 0.07, 0.06, 0.05], // last 3 are all < 0.08
    });
    expect(met.potentiallyMet).toBe(true);

    const notMet = evaluateInvalidationCriterion({
      criterionId: 'c5',
      description: 'Revenue growth remains below 8% for 3 consecutive quarters.',
      metric: 'REVENUE_GROWTH',
      comparator: 'LESS_THAN',
      thresholdValue: 0.08,
      thresholdUnit: 'ratio',
      consecutivePeriods: 3,
      recentValues: [0.09, 0.07, 0.09, 0.05], // the third-to-last value breaks the streak
    });
    expect(notMet.potentiallyMet).toBe(false);
  });

  it('reports insufficient data when fewer periods are available than required', () => {
    const result = evaluateInvalidationCriterion({
      criterionId: 'c6',
      description: 'Revenue growth remains below 8% for 3 consecutive quarters.',
      metric: 'REVENUE_GROWTH',
      comparator: 'LESS_THAN',
      thresholdValue: 0.08,
      thresholdUnit: 'ratio',
      consecutivePeriods: 3,
      recentValues: [0.05, 0.06],
    });
    expect(result.checkable).toBe(true);
    expect(result.potentiallyMet).toBe(false);
    expect(result.reason).toContain('only 2 are available');
  });

  it('reports no live data when recentValues is empty for a checkable criterion', () => {
    const result = evaluateInvalidationCriterion({
      criterionId: 'c7',
      description: 'DCF implied value falls below $75.',
      metric: 'WACC',
      comparator: 'LESS_THAN',
      thresholdValue: 75,
      thresholdUnit: 'usd',
      consecutivePeriods: null,
      recentValues: [],
    });
    expect(result.checkable).toBe(true);
    expect(result.potentiallyMet).toBe(false);
    expect(result.reason).toContain('No live data');
  });
});
