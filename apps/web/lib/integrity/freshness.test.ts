import { describe, expect, it } from 'vitest';
import { classifyDatasetFreshness, classifyFreshness, DEFAULT_REFRESH_FREQUENCY_DAYS } from './freshness';

const NOW = new Date('2026-08-14T00:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('classifyFreshness', () => {
  it('returns UNKNOWN for a null timestamp — never silently CURRENT', () => {
    expect(classifyFreshness(null, 30, NOW)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for an unparseable timestamp', () => {
    expect(classifyFreshness('not-a-date', 30, NOW)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for a timestamp in the future', () => {
    expect(classifyFreshness(daysAgo(-5), 30, NOW)).toBe('UNKNOWN');
  });

  it('returns CURRENT when within the expected refresh window', () => {
    expect(classifyFreshness(daysAgo(1), 30, NOW)).toBe('CURRENT');
    expect(classifyFreshness(daysAgo(30), 30, NOW)).toBe('CURRENT');
  });

  it('returns AGING when past the window but within the aging multiplier', () => {
    expect(classifyFreshness(daysAgo(31), 30, NOW)).toBe('AGING');
    expect(classifyFreshness(daysAgo(60), 30, NOW)).toBe('AGING');
  });

  it('returns STALE once past the aging multiplier window', () => {
    expect(classifyFreshness(daysAgo(61), 30, NOW)).toBe('STALE');
    expect(classifyFreshness(daysAgo(400), 30, NOW)).toBe('STALE');
  });

  it('respects a custom aging multiplier', () => {
    expect(classifyFreshness(daysAgo(25), 10, NOW, 3)).toBe('AGING'); // within 30
    expect(classifyFreshness(daysAgo(31), 10, NOW, 3)).toBe('STALE'); // past 30
  });
});

describe('classifyDatasetFreshness', () => {
  it('uses market data\'s tight 1-day expectation', () => {
    expect(classifyDatasetFreshness('MARKET_DATA', daysAgo(0.5), NOW)).toBe('CURRENT');
    expect(classifyDatasetFreshness('MARKET_DATA', daysAgo(3), NOW)).toBe('STALE');
  });

  it('uses financial statements\' quarterly-scale expectation', () => {
    expect(classifyDatasetFreshness('FINANCIAL_STATEMENTS', daysAgo(90), NOW)).toBe('CURRENT');
    expect(classifyDatasetFreshness('FINANCIAL_STATEMENTS', daysAgo(150), NOW)).toBe('AGING');
    expect(classifyDatasetFreshness('FINANCIAL_STATEMENTS', daysAgo(250), NOW)).toBe('STALE');
  });

  it('every dataset type has a configured expectation', () => {
    const types = Object.keys(DEFAULT_REFRESH_FREQUENCY_DAYS);
    expect(types.length).toBeGreaterThan(0);
    for (const days of Object.values(DEFAULT_REFRESH_FREQUENCY_DAYS)) {
      expect(days).toBeGreaterThan(0);
    }
  });
});
