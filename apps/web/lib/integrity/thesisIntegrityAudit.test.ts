import { describe, expect, it } from 'vitest';
import { auditThesisAssumptionAgainstGuidance, computeGuidanceImpliedGrowthRange } from './thesisIntegrityAudit';

describe('computeGuidanceImpliedGrowthRange', () => {
  it('converts dollar guidance into a growth-rate range using the prior period as baseline', () => {
    // Prior revenue $10B, guidance $10.8B-$11.0B -> implied growth 8%-10%.
    const range = computeGuidanceImpliedGrowthRange({ low: 10_800_000_000, high: 11_000_000_000, midpoint: 10_900_000_000 }, 10_000_000_000);
    expect(range?.low).toBeCloseTo(0.08);
    expect(range?.high).toBeCloseTo(0.1);
  });

  it('returns null without a prior-period baseline', () => {
    expect(computeGuidanceImpliedGrowthRange({ low: 100, high: 110, midpoint: 105 }, null)).toBeNull();
  });

  it('returns null with a zero baseline', () => {
    expect(computeGuidanceImpliedGrowthRange({ low: 100, high: 110, midpoint: 105 }, 0)).toBeNull();
  });
});

describe('auditThesisAssumptionAgainstGuidance', () => {
  it('flags ASSUMPTION CONFLICT for the spec\'s own worked example: thesis 15% CAGR vs. guidance 8-10%', () => {
    const guidanceRange = computeGuidanceImpliedGrowthRange({ low: 10_800_000_000, high: 11_000_000_000, midpoint: 10_900_000_000 }, 10_000_000_000);
    const finding = auditThesisAssumptionAgainstGuidance({ assumptionLabel: 'Revenue CAGR', assumptionValue: 0.15, guidanceImpliedRange: guidanceRange });
    expect(finding.passed).toBe(false);
    expect(finding.severity).toBe('MEDIUM');
    expect(finding.message).toMatch(/ASSUMPTION CONFLICT/);
    expect(finding.message).toMatch(/does not automatically invalidate/i);
  });

  it('passes when the assumption falls within the guidance-implied range', () => {
    const guidanceRange = computeGuidanceImpliedGrowthRange({ low: 10_800_000_000, high: 11_000_000_000, midpoint: 10_900_000_000 }, 10_000_000_000);
    const finding = auditThesisAssumptionAgainstGuidance({ assumptionLabel: 'Revenue CAGR', assumptionValue: 0.09, guidanceImpliedRange: guidanceRange });
    expect(finding.passed).toBe(true);
  });

  it('is not checkable when there is no guidance-implied range', () => {
    const finding = auditThesisAssumptionAgainstGuidance({ assumptionLabel: 'Revenue CAGR', assumptionValue: 0.15, guidanceImpliedRange: null });
    expect(finding.severity).toBe('INFO');
    expect(finding.passed).toBe(true);
  });
});
