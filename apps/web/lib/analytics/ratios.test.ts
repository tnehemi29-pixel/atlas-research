import { describe, expect, it } from 'vitest';
import {
  averageBalance,
  calculateFreeCashFlow,
  checkBalanceSheetEquation,
  fcfMargin,
  grossMargin,
  growthRate,
  netDebt,
  netMargin,
  operatingMargin,
  roa,
  roe,
  safeDivide,
  sumOrNull,
  totalDebt,
} from './ratios';

describe('safeDivide', () => {
  it('divides normally', () => {
    expect(safeDivide(10, 4)).toBe(2.5);
  });

  it('returns null for a zero denominator instead of Infinity', () => {
    expect(safeDivide(10, 0)).toBeNull();
  });

  it('returns null for a null numerator or denominator', () => {
    expect(safeDivide(null, 10)).toBeNull();
    expect(safeDivide(10, null)).toBeNull();
  });

  it('handles negative numerator and denominator correctly, never NaN', () => {
    expect(safeDivide(-10, 4)).toBe(-2.5);
    expect(safeDivide(10, -4)).toBe(-2.5);
    expect(safeDivide(-10, -4)).toBe(2.5);
  });
});

describe('growthRate (revenue growth, EPS growth)', () => {
  it('computes (current/previous) - 1', () => {
    expect(growthRate(115, 100)).toBeCloseTo(0.15);
  });

  it('handles a decline as a negative ratio', () => {
    expect(growthRate(80, 100)).toBeCloseTo(-0.2);
  });

  it('returns null when there is no prior period (first historical period)', () => {
    expect(growthRate(100, null)).toBeNull();
  });

  it('returns null when the current period is missing', () => {
    expect(growthRate(null, 100)).toBeNull();
  });

  it('returns null rather than Infinity when the prior value is zero', () => {
    expect(growthRate(100, 0)).toBeNull();
  });

  it('handles a swing from negative to positive without producing a nonsensical ratio class', () => {
    // -50 -> 50 is a real, computable (if extreme) growth rate: (50/-50) - 1 = -2
    expect(growthRate(50, -50)).toBe(-2);
  });
});

describe('margins (gross, operating, net, FCF)', () => {
  it('gross margin = gross profit / revenue', () => {
    expect(grossMargin(40, 100)).toBeCloseTo(0.4);
  });

  it('operating margin = operating income / revenue', () => {
    expect(operatingMargin(20, 100)).toBeCloseTo(0.2);
  });

  it('net margin = net income / revenue', () => {
    expect(netMargin(10, 100)).toBeCloseTo(0.1);
  });

  it('net margin is negative when net income is negative — not clamped to zero', () => {
    expect(netMargin(-10, 100)).toBeCloseTo(-0.1);
  });

  it('FCF margin = free cash flow / revenue', () => {
    expect(fcfMargin(15, 100)).toBeCloseTo(0.15);
  });

  it('every margin is null on a zero-revenue denominator', () => {
    expect(grossMargin(40, 0)).toBeNull();
    expect(operatingMargin(20, 0)).toBeNull();
    expect(netMargin(10, 0)).toBeNull();
    expect(fcfMargin(15, 0)).toBeNull();
  });

  it('every margin is null when its numerator is missing', () => {
    expect(grossMargin(null, 100)).toBeNull();
    expect(operatingMargin(null, 100)).toBeNull();
    expect(netMargin(null, 100)).toBeNull();
    expect(fcfMargin(null, 100)).toBeNull();
  });
});

describe('calculateFreeCashFlow', () => {
  it('FCF = operating cash flow - capex', () => {
    expect(calculateFreeCashFlow(120, 20)).toBe(100);
  });

  it('is negative when capex exceeds operating cash flow', () => {
    expect(calculateFreeCashFlow(10, 30)).toBe(-20);
  });

  it('is null when either input is missing', () => {
    expect(calculateFreeCashFlow(null, 20)).toBeNull();
    expect(calculateFreeCashFlow(120, null)).toBeNull();
  });
});

describe('totalDebt / sumOrNull', () => {
  it('sums short-term and long-term debt', () => {
    expect(totalDebt(10, 40)).toBe(50);
  });

  it('uses whichever part is present rather than nulling the whole figure', () => {
    expect(totalDebt(10, null)).toBe(10);
    expect(totalDebt(null, 40)).toBe(40);
  });

  it('is null only when every part is missing', () => {
    expect(totalDebt(null, null)).toBeNull();
    expect(sumOrNull(null, null, null)).toBeNull();
  });
});

describe('netDebt', () => {
  it('Net Debt = Total Debt - Cash', () => {
    expect(netDebt(50, 20)).toBe(30);
  });

  it('is negative when cash exceeds debt (a net-cash position) — not clamped', () => {
    expect(netDebt(20, 50)).toBe(-30);
  });

  it('requires both inputs — unlike totalDebt, a missing cash figure cannot be assumed', () => {
    expect(netDebt(null, 20)).toBeNull();
    expect(netDebt(50, null)).toBeNull();
  });
});

describe('averageBalance / ROE / ROA', () => {
  it('averages current and prior balance', () => {
    expect(averageBalance(120, 80)).toBe(100);
  });

  it('falls back to the ending balance alone for the first historical period', () => {
    expect(averageBalance(120, null)).toBe(120);
  });

  it('ROE = net income / average equity', () => {
    expect(roe(20, 120, 80)).toBeCloseTo(0.2); // 20 / avg(120,80)=100
  });

  it('ROA = net income / average assets', () => {
    expect(roa(20, 220, 180)).toBeCloseTo(0.1); // 20 / avg(220,180)=200
  });

  it('ROE/ROA use the single ending balance when there is no prior period', () => {
    expect(roe(20, 100, null)).toBeCloseTo(0.2);
  });

  it('ROE/ROA are null when net income is missing or average balance is zero', () => {
    expect(roe(null, 120, 80)).toBeNull();
    expect(roe(20, 0, 0)).toBeNull();
  });

  it('ROE is negative when net income is negative — negative returns are real information', () => {
    expect(roe(-20, 120, 80)).toBeCloseTo(-0.2);
  });
});

describe('checkBalanceSheetEquation', () => {
  it('reports balanced when Assets = Liabilities + Equity exactly', () => {
    const result = checkBalanceSheetEquation(500, 300, 200);
    expect(result.balanced).toBe(true);
    expect(result.diffRatio).toBe(0);
  });

  it('reports balanced within a small tolerance', () => {
    const result = checkBalanceSheetEquation(500, 300, 201); // 1 off on 500 = 0.2%
    expect(result.balanced).toBe(true);
  });

  it('reports unbalanced beyond tolerance without altering the input numbers', () => {
    const result = checkBalanceSheetEquation(500, 300, 100); // should be 200, off by 100
    expect(result.balanced).toBe(false);
    expect(result.diffRatio).toBeCloseTo(0.2);
  });

  it('does not claim a discrepancy when data is simply missing', () => {
    const result = checkBalanceSheetEquation(null, 300, 200);
    expect(result.balanced).toBe(true);
    expect(result.diffRatio).toBeNull();
  });
});
