import { describe, expect, it } from 'vitest';
import { computeFinancialChanges } from './financialChanges';

describe('computeFinancialChanges — hand-verified case', () => {
  // current: revenue 1100, opInc 220 (20% margin), netIncome 150, cash 500, debt 300
  // prior:   revenue 1000, opInc 150 (15% margin), netIncome 100, cash 400, debt 350
  const current = { revenue: 1100, operatingIncome: 220, netIncome: 150, cash: 500, totalDebt: 300 };
  const prior = { revenue: 1000, operatingIncome: 150, netIncome: 100, cash: 400, totalDebt: 350 };

  const changes = computeFinancialChanges(current, prior);

  it('computes revenue growth as a ratio: (1100/1000)-1 = 0.10', () => {
    const revenue = changes.find((c) => c.label === 'Revenue');
    expect(revenue?.change).toBeCloseTo(0.1, 6);
    expect(revenue?.changeKind).toBe('growth');
  });

  it('computes net income growth: (150/100)-1 = 0.50', () => {
    const netIncome = changes.find((c) => c.label === 'Net Income');
    expect(netIncome?.change).toBeCloseTo(0.5, 6);
  });

  it('computes operating margin change in percentage POINTS, not a growth rate of the ratio: 20% - 15% = +5pp', () => {
    const margin = changes.find((c) => c.label === 'Operating Margin');
    expect(margin?.current).toBeCloseTo(0.2, 6);
    expect(margin?.prior).toBeCloseTo(0.15, 6);
    expect(margin?.change).toBeCloseTo(0.05, 6);
    expect(margin?.changeKind).toBe('points');
  });

  it('computes cash growth: (500/400)-1 = 0.25', () => {
    expect(changes.find((c) => c.label === 'Cash')?.change).toBeCloseTo(0.25, 6);
  });

  it('computes total debt growth (a decrease): (300/350)-1 ≈ -0.142857', () => {
    expect(changes.find((c) => c.label === 'Total Debt')?.change).toBeCloseTo(-0.142857, 5);
  });

  it('every metric is null, not fabricated, when the underlying data is missing', () => {
    const missing = computeFinancialChanges(
      { revenue: null, operatingIncome: null, netIncome: null, cash: null, totalDebt: null },
      { revenue: 1000, operatingIncome: 150, netIncome: 100, cash: 400, totalDebt: 350 },
    );
    expect(missing.every((m) => m.change === null)).toBe(true);
  });
});
