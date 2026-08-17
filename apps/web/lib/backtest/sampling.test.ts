import { describe, expect, it } from 'vitest';
import { generateMonthlySampleDates } from './sampling';

describe('generateMonthlySampleDates', () => {
  it('generates first-of-month dates spanning the range, inclusive', () => {
    const result = generateMonthlySampleDates('2026-01-15', '2026-04-01');
    expect(result.dates).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
    expect(result.wasCapped).toBe(false);
  });

  it('rolls over the year boundary correctly', () => {
    const result = generateMonthlySampleDates('2025-11-01', '2026-02-01');
    expect(result.dates).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  });

  it('caps the number of samples and reports wasCapped when the range is wider than the cap', () => {
    const result = generateMonthlySampleDates('2015-01-01', '2026-01-01', 12);
    expect(result.dates).toHaveLength(12);
    expect(result.wasCapped).toBe(true);
  });

  it('does not report wasCapped when the range exactly fits the cap', () => {
    const result = generateMonthlySampleDates('2026-01-01', '2026-03-01', 3);
    expect(result.dates).toHaveLength(3);
    expect(result.wasCapped).toBe(false);
  });

  it('returns a single date when from and to are the same month', () => {
    const result = generateMonthlySampleDates('2026-06-15', '2026-06-30');
    expect(result.dates).toEqual(['2026-06-01']);
  });
});
