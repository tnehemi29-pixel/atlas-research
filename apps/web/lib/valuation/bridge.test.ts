import { describe, expect, it } from 'vitest';
import {
  computeEnterpriseValue,
  computeEquityValue,
  computeImpliedSharePrice,
  computeUpsideDownside,
} from './bridge';

describe('computeEnterpriseValue', () => {
  it('PV of forecast FCF + PV of terminal value', () => {
    expect(computeEnterpriseValue(500, 1500)).toBe(2000);
  });

  it('is null if either PV is unknown', () => {
    expect(computeEnterpriseValue(null, 1500)).toBeNull();
    expect(computeEnterpriseValue(500, null)).toBeNull();
  });
});

describe('computeEquityValue', () => {
  it('Enterprise Value + Cash - Total Debt', () => {
    expect(computeEquityValue(2000, 100, 300)).toBe(1800);
  });

  it('handles a net-cash company (cash exceeds debt) — equity value exceeds EV', () => {
    expect(computeEquityValue(2000, 500, 100)).toBe(2400);
  });

  it('is null when cash or debt is missing — never assumes zero', () => {
    expect(computeEquityValue(2000, null, 300)).toBeNull();
    expect(computeEquityValue(2000, 100, null)).toBeNull();
  });
});

describe('computeImpliedSharePrice', () => {
  it('Equity Value / Diluted Shares Outstanding', () => {
    expect(computeImpliedSharePrice(1800, 100)).toBe(18);
  });

  it('is null when shares outstanding is missing or zero', () => {
    expect(computeImpliedSharePrice(1800, null)).toBeNull();
    expect(computeImpliedSharePrice(1800, 0)).toBeNull();
  });

  it('a negative equity value produces a negative (but real) implied price rather than being hidden', () => {
    expect(computeImpliedSharePrice(-500, 100)).toBe(-5);
  });
});

describe('computeUpsideDownside', () => {
  it('(Implied Price / Current Price) - 1', () => {
    expect(computeUpsideDownside(120, 100)).toBeCloseTo(0.2);
  });

  it('is negative when the model implies downside', () => {
    expect(computeUpsideDownside(80, 100)).toBeCloseTo(-0.2);
  });

  it('is null when either price is missing or current price is zero', () => {
    expect(computeUpsideDownside(null, 100)).toBeNull();
    expect(computeUpsideDownside(120, null)).toBeNull();
    expect(computeUpsideDownside(120, 0)).toBeNull();
  });
});
