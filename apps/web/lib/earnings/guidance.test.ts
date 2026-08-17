import { describe, expect, it } from 'vitest';
import {
  computeMidpoint,
  resolveGuidanceChange,
  resolveGuidanceObservations,
  type GuidanceCandidate,
  type PriorGuidance,
} from './guidance';

describe('computeMidpoint', () => {
  it('averages low and high', () => {
    expect(computeMidpoint(10.0, 10.5)).toBeCloseTo(10.25, 5);
  });

  it('resolves to the single value when only one side is stated', () => {
    expect(computeMidpoint(5, null)).toBe(5);
    expect(computeMidpoint(null, 8)).toBe(8);
  });

  it('returns null when neither side is stated', () => {
    expect(computeMidpoint(null, null)).toBeNull();
  });
});

describe('resolveGuidanceChange', () => {
  it('is NEW when there is no prior guidance to compare against', () => {
    expect(resolveGuidanceChange(10.75, null)).toBe('NEW');
  });

  it('is NEW when the current midpoint itself is unresolvable', () => {
    expect(resolveGuidanceChange(null, 10.25)).toBe('NEW');
  });

  it('is MAINTAINED when the midpoint is unchanged', () => {
    expect(resolveGuidanceChange(10.25, 10.25)).toBe('MAINTAINED');
  });

  it('matches the spec worked example: $10.0-10.5B -> $10.5-11.0B is INCREASED', () => {
    const prior = computeMidpoint(10.0, 10.5); // 10.25
    const current = computeMidpoint(10.5, 11.0); // 10.75
    expect(resolveGuidanceChange(current, prior)).toBe('INCREASED');
  });

  it('is DECREASED when the midpoint drops', () => {
    const prior = computeMidpoint(10.5, 11.0);
    const current = computeMidpoint(10.0, 10.5);
    expect(resolveGuidanceChange(current, prior)).toBe('DECREASED');
  });
});

describe('resolveGuidanceObservations', () => {
  const candidates: GuidanceCandidate[] = [
    {
      metric: 'REVENUE',
      metricLabel: 'Q4 Revenue',
      period: 'Q4 2025',
      low: 10.5,
      high: 11.0,
      sourceExcerpt: 'we expect revenue in the range of $10.5 billion to $11.0 billion',
      sourceAnchor: 'segment-12',
    },
    {
      metric: 'CAPEX',
      metricLabel: 'Full Year CapEx',
      period: 'FY2025',
      low: 900,
      high: 900,
      sourceExcerpt: 'full-year capital expenditures of approximately $900 million',
      sourceAnchor: 'segment-13',
    },
  ];

  it('attaches the matching prior guidance by metric+period and computes the change', () => {
    const prior: PriorGuidance[] = [
      { metric: 'REVENUE', period: 'Q4 2025', low: 10.0, high: 10.5, midpoint: 10.25 },
    ];
    const [revenue, capex] = resolveGuidanceObservations(candidates, prior);

    expect(revenue?.midpoint).toBeCloseTo(10.75, 5);
    expect(revenue?.priorMidpoint).toBeCloseTo(10.25, 5);
    expect(revenue?.change).toBe('INCREASED');

    // No prior CapEx guidance for FY2025 in the fixture -> NEW.
    expect(capex?.priorMidpoint).toBeNull();
    expect(capex?.change).toBe('NEW');
  });

  it('does not match guidance across different periods for the same metric', () => {
    const prior: PriorGuidance[] = [
      { metric: 'REVENUE', period: 'Q3 2025', low: 9.5, high: 10.0, midpoint: 9.75 },
    ];
    const [revenue] = resolveGuidanceObservations(candidates, prior);
    expect(revenue?.priorMidpoint).toBeNull();
    expect(revenue?.change).toBe('NEW');
  });

  it('never lets a mismatched metric supply a prior for the wrong metric', () => {
    const prior: PriorGuidance[] = [
      { metric: 'EPS', period: 'Q4 2025', low: 1.0, high: 1.1, midpoint: 1.05 },
    ];
    const [revenue] = resolveGuidanceObservations(candidates, prior);
    expect(revenue?.priorMidpoint).toBeNull();
  });

  it('preserves source excerpt and anchor for traceability', () => {
    const [revenue] = resolveGuidanceObservations(candidates, []);
    expect(revenue?.sourceExcerpt).toContain('$10.5 billion to $11.0 billion');
    expect(revenue?.sourceAnchor).toBe('segment-12');
  });
});
