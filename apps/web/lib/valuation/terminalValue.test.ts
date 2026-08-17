import { describe, expect, it } from 'vitest';
import {
  exitMultipleTerminalValue,
  impliedExitMultiple,
  impliedPerpetuityGrowthRate,
  perpetuityGrowthTerminalValue,
} from './terminalValue';

describe('perpetuityGrowthTerminalValue', () => {
  it('matches a hand-calculated case: FCF 100, WACC 10%, g 3% -> TV = 103 / 0.07 = 1471.43', () => {
    expect(perpetuityGrowthTerminalValue(100, 0.1, 0.03)).toBeCloseTo(1471.4286, 3);
  });

  it('is null when WACC equals terminal growth (division by zero)', () => {
    expect(perpetuityGrowthTerminalValue(100, 0.05, 0.05)).toBeNull();
  });

  it('is null when WACC is below terminal growth — an invalid, unbounded model', () => {
    expect(perpetuityGrowthTerminalValue(100, 0.03, 0.05)).toBeNull();
  });

  it('is null when the final-year FCF or WACC is missing', () => {
    expect(perpetuityGrowthTerminalValue(null, 0.1, 0.03)).toBeNull();
    expect(perpetuityGrowthTerminalValue(100, null, 0.03)).toBeNull();
  });

  it('handles a negative final-year FCF without special-casing it away', () => {
    expect(perpetuityGrowthTerminalValue(-50, 0.1, 0.03)).toBeCloseTo(-735.71, 1);
  });
});

describe('exitMultipleTerminalValue', () => {
  it('matches a hand-calculated case: EBIT 150 + D&A 50 = EBITDA 200, 10x multiple -> TV = 2000', () => {
    expect(exitMultipleTerminalValue(150, 50, 10)).toBe(2000);
  });

  it('is null when EBIT or D&A is missing', () => {
    expect(exitMultipleTerminalValue(null, 50, 10)).toBeNull();
    expect(exitMultipleTerminalValue(150, null, 10)).toBeNull();
  });
});

describe('cross-check formulas', () => {
  it('impliedExitMultiple: a 1471.43 TV against 200 EBITDA implies a ~7.36x multiple', () => {
    expect(impliedExitMultiple(1471.4286, 150, 50)).toBeCloseTo(7.357, 2);
  });

  it('impliedPerpetuityGrowthRate: a 2000 TV against FCF 100 and WACC 10% implies g ~= 4.76%', () => {
    // g = (TV*WACC - FCF) / (TV + FCF) = (200 - 100) / 2100
    expect(impliedPerpetuityGrowthRate(2000, 100, 0.1)).toBeCloseTo(0.047619, 5);
  });

  it('the two cross-checks are consistent with each other on the same inputs', () => {
    const tv = perpetuityGrowthTerminalValue(100, 0.1, 0.03);
    const impliedMultiple = impliedExitMultiple(tv, 150, 50);
    const backOutTv = exitMultipleTerminalValue(150, 50, impliedMultiple!);
    expect(backOutTv).toBeCloseTo(tv!, 6);
  });
});
