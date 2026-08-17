import { describe, expect, it } from 'vitest';
import {
  classifyDcfValuationChange,
  classifyFinancialChange,
  classifyGuidanceChange,
  classifyMarginChange,
  maxMateriality,
  materialityAtLeast,
  shouldRunAiAnalysis,
} from './materialityConfig';

describe('classifyFinancialChange', () => {
  it('is LOW for a small change', () => {
    expect(classifyFinancialChange(0.02)).toBe('LOW');
  });

  it('is HIGH for a large guidance-scale change per the spec worked example', () => {
    // Not itself a guidance test, but confirms the general magnitude tiers.
    expect(classifyFinancialChange(0.2)).toBe('HIGH');
  });

  it('is CRITICAL for a very large change', () => {
    expect(classifyFinancialChange(0.35)).toBe('CRITICAL');
  });

  it('treats negative changes the same as positive by magnitude', () => {
    expect(classifyFinancialChange(-0.2)).toBe('HIGH');
  });

  it('is LOW (not an error) for a null change', () => {
    expect(classifyFinancialChange(null)).toBe('LOW');
  });
});

describe('classifyMarginChange', () => {
  it('is LOW for a small bps move', () => {
    expect(classifyMarginChange(50)).toBe('LOW');
  });

  it('is HIGH for a 400 bps move (the spec worked example)', () => {
    expect(classifyMarginChange(-400)).toBe('HIGH');
  });

  it('is CRITICAL for a very large bps move', () => {
    expect(classifyMarginChange(700)).toBe('CRITICAL');
  });
});

describe('classifyGuidanceChange', () => {
  it('is LOW for a small guidance move', () => {
    expect(classifyGuidanceChange(0.01)).toBe('LOW');
  });

  it('is MEDIUM for a moderate guidance move (the spec worked example, ~4.8%)', () => {
    expect(classifyGuidanceChange(0.048)).toBe('MEDIUM');
  });

  it('is HIGH for a major guidance cut', () => {
    expect(classifyGuidanceChange(-0.1)).toBe('HIGH');
  });
});

describe('classifyDcfValuationChange', () => {
  it('is HIGH for the spec worked example (-12%)', () => {
    expect(classifyDcfValuationChange(-0.12)).toBe('HIGH');
  });
});

describe('materialityAtLeast / maxMateriality', () => {
  it('orders materiality tiers correctly', () => {
    expect(materialityAtLeast('HIGH', 'MEDIUM')).toBe(true);
    expect(materialityAtLeast('LOW', 'MEDIUM')).toBe(false);
    expect(materialityAtLeast('CRITICAL', 'CRITICAL')).toBe(true);
  });

  it('takes the more severe of two tiers', () => {
    expect(maxMateriality('LOW', 'HIGH')).toBe('HIGH');
    expect(maxMateriality('CRITICAL', 'MEDIUM')).toBe('CRITICAL');
  });
});

describe('shouldRunAiAnalysis', () => {
  it('is false for LOW and MEDIUM (cost control)', () => {
    expect(shouldRunAiAnalysis('LOW')).toBe(false);
    expect(shouldRunAiAnalysis('MEDIUM')).toBe(false);
  });

  it('is true for HIGH and CRITICAL', () => {
    expect(shouldRunAiAnalysis('HIGH')).toBe(true);
    expect(shouldRunAiAnalysis('CRITICAL')).toBe(true);
  });
});
