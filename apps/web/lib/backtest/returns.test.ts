import { describe, expect, it } from 'vitest';
import { applyTransactionCosts, excessReturn } from './returns';
import { defaultRoundTripCostBps } from './backtestConfig';

describe('excessReturn', () => {
  it('subtracts benchmark return from asset return', () => {
    expect(excessReturn(0.15, 0.1)).toBeCloseTo(0.05);
    expect(excessReturn(-0.05, 0.1)).toBeCloseTo(-0.15);
  });

  it('propagates null rather than treating a missing input as zero', () => {
    expect(excessReturn(null, 0.1)).toBeNull();
    expect(excessReturn(0.1, null)).toBeNull();
  });
});

describe('applyTransactionCosts', () => {
  it('nets the default round-trip cost (20bps) out of a return by default', () => {
    expect(defaultRoundTripCostBps()).toBe(20);
    expect(applyTransactionCosts(0.1)).toBeCloseTo(0.1 - 0.002);
  });

  it('accepts an explicit cost override, including zero (frictionless)', () => {
    expect(applyTransactionCosts(0.1, 0)).toBeCloseTo(0.1);
    expect(applyTransactionCosts(0.1, 50)).toBeCloseTo(0.1 - 0.005);
  });
});
