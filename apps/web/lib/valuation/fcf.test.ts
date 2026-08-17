import { describe, expect, it } from 'vitest';
import { computeNopat, computeUnleveredFcf, computeUnleveredFcfFromEbit } from './fcf';

describe('computeNopat', () => {
  it('NOPAT = EBIT * (1 - taxRate)', () => {
    expect(computeNopat(100, 0.25)).toBe(75);
  });

  it('handles a zero tax rate', () => {
    expect(computeNopat(100, 0)).toBe(100);
  });

  it('handles negative EBIT — a tax benefit on an operating loss is real', () => {
    expect(computeNopat(-100, 0.25)).toBe(-75);
  });

  it('is null when either input is missing', () => {
    expect(computeNopat(null, 0.25)).toBeNull();
    expect(computeNopat(100, null)).toBeNull();
  });
});

describe('computeUnleveredFcf', () => {
  it('NOPAT + D&A - CapEx - ChangeInNWC', () => {
    expect(computeUnleveredFcf(75, 20, 15, 5)).toBe(75);
  });

  it('CapEx is always subtracted regardless of sign stored — a positive magnitude reduces FCF', () => {
    expect(computeUnleveredFcf(100, 0, 30, 0)).toBe(70);
  });

  it('a decrease in NWC (negative change) is a source of cash — increases FCF', () => {
    expect(computeUnleveredFcf(100, 0, 0, -10)).toBe(110);
  });

  it('is null if any single input is missing — never substitutes zero', () => {
    expect(computeUnleveredFcf(null, 20, 15, 5)).toBeNull();
    expect(computeUnleveredFcf(75, null, 15, 5)).toBeNull();
    expect(computeUnleveredFcf(75, 20, null, 5)).toBeNull();
    expect(computeUnleveredFcf(75, 20, 15, null)).toBeNull();
  });
});

describe('computeUnleveredFcfFromEbit', () => {
  it('chains EBIT -> NOPAT -> FCF correctly', () => {
    // EBIT 200, tax 20% -> NOPAT 160; +30 D&A -40 capex -10 dNWC = 140
    expect(computeUnleveredFcfFromEbit(200, 0.2, 30, 40, 10)).toBe(140);
  });

  it('propagates null through the whole chain', () => {
    expect(computeUnleveredFcfFromEbit(null, 0.2, 30, 40, 10)).toBeNull();
  });
});
