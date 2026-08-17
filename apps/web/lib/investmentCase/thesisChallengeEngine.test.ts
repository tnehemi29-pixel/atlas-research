import { describe, expect, it } from 'vitest';
import { evaluateAssumptionChallenge, evaluateThesisChallenges } from './thesisChallengeEngine';

describe('evaluateAssumptionChallenge', () => {
  it('matches the spec worked example: 15% assumed vs 9-11% guidance -> -4 to -6 percentage points, flagged', () => {
    const challenge = evaluateAssumptionChallenge({
      metric: 'REVENUE_GROWTH',
      label: 'Revenue Growth',
      assumptionValue: 0.15,
      unit: 'ratio',
      liveValue: 0.1, // midpoint of 9-11%
      source: 'Latest management guidance',
      affectedAreas: ['DCF', 'Growth thesis', 'Valuation'],
    });

    expect(challenge).not.toBeNull();
    expect(challenge?.differenceKind).toBe('PERCENTAGE_POINTS');
    expect(challenge?.difference).toBeCloseTo(-0.05);
    expect(challenge?.affectedAreas).toEqual(['DCF', 'Growth thesis', 'Valuation']);
  });

  it('does not fire for a ratio metric gap below its own threshold', () => {
    const challenge = evaluateAssumptionChallenge({
      metric: 'OPERATING_MARGIN',
      label: 'Operating Margin',
      assumptionValue: 0.3,
      unit: 'ratio',
      liveValue: 0.305, // +0.5pp, below the 2pp threshold
      source: 'Current fundamentals',
      affectedAreas: ['DCF'],
    });
    expect(challenge).toBeNull();
  });

  it('uses relative percent change (not percentage points) for a non-ratio metric like Exit Multiple', () => {
    const challenge = evaluateAssumptionChallenge({
      metric: 'EXIT_MULTIPLE',
      label: 'Exit Multiple',
      assumptionValue: 10,
      unit: 'x',
      liveValue: 12, // +20% relative change, clears the 10% threshold
      source: 'Current DCF Base case',
      affectedAreas: ['DCF', 'Valuation'],
    });
    expect(challenge).not.toBeNull();
    expect(challenge?.differenceKind).toBe('RELATIVE_PERCENT');
    expect(challenge?.difference).toBeCloseTo(0.2);
  });

  it('never claims the thesis is broken — the output is always framed as a potential challenge', () => {
    const challenge = evaluateAssumptionChallenge({
      metric: 'WACC',
      label: 'WACC',
      assumptionValue: 0.08,
      unit: 'ratio',
      liveValue: 0.095,
      source: 'Current DCF Base case',
      affectedAreas: ['DCF'],
    });
    expect(challenge).not.toBeNull();
    expect(challenge!.trigger.toLowerCase()).not.toContain('broken');
    expect(challenge!.trigger.toLowerCase()).not.toContain('invalidated');
  });
});

describe('evaluateThesisChallenges', () => {
  it('filters out non-firing assumptions and returns only real challenges', () => {
    const challenges = evaluateThesisChallenges([
      { metric: 'REVENUE_GROWTH', label: 'Revenue Growth', assumptionValue: 0.15, unit: 'ratio', liveValue: 0.1, source: 'Guidance', affectedAreas: ['DCF'] },
      { metric: 'FCF_MARGIN', label: 'FCF Margin', assumptionValue: 0.2, unit: 'ratio', liveValue: 0.201, source: 'Fundamentals', affectedAreas: ['DCF'] },
    ]);
    expect(challenges).toHaveLength(1);
    expect(challenges[0]?.metric).toBe('REVENUE_GROWTH');
  });
});
