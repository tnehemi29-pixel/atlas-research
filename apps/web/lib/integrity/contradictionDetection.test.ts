import { describe, expect, it } from 'vitest';
import { computeTrendDirection, detectDirectionalContradiction } from './contradictionDetection';

describe('computeTrendDirection', () => {
  it('detects a consistently increasing sequence', () => {
    expect(computeTrendDirection([0.2, 0.22, 0.24, 0.26])).toBe('INCREASING');
  });

  it('detects a consistently decreasing sequence — the spec\'s own "three consecutive quarters" example', () => {
    expect(computeTrendDirection([0.28, 0.26, 0.24, 0.22])).toBe('DECREASING');
  });

  it('treats a flat sequence as STABLE', () => {
    expect(computeTrendDirection([0.250, 0.2505, 0.2502, 0.2508])).toBe('STABLE');
  });

  it('treats a mixed (up then down) sequence as STABLE, not a confident direction', () => {
    expect(computeTrendDirection([0.2, 0.3, 0.15])).toBe('STABLE');
  });

  it('treats fewer than two values as STABLE', () => {
    expect(computeTrendDirection([0.2])).toBe('STABLE');
    expect(computeTrendDirection([])).toBe('STABLE');
  });
});

describe('detectDirectionalContradiction', () => {
  it('flags a contradiction — the spec\'s own "margins expanding" vs. "declined 3 quarters" example', () => {
    const finding = detectDirectionalContradiction({
      metric: 'Operating Margin',
      claimDirection: 'INCREASING',
      claimDescription: 'Operating margins are expanding.',
      claimAsOfDate: '2026-01-15',
      newEvidenceDirection: 'DECREASING',
      newEvidenceDescription: 'Operating margin declined for three consecutive quarters.',
      newEvidenceAsOfDate: '2026-07-01',
    });
    expect(finding.contradicted).toBe(true);
    expect(finding.detail).toMatch(/Potential research contradiction/);
  });

  it('does not flag a contradiction when the new evidence continues the same direction', () => {
    const finding = detectDirectionalContradiction({
      metric: 'Operating Margin',
      claimDirection: 'INCREASING',
      claimDescription: 'Operating margins are expanding.',
      claimAsOfDate: '2026-01-15',
      newEvidenceDirection: 'INCREASING',
      newEvidenceDescription: 'Operating margin continued to expand.',
      newEvidenceAsOfDate: '2026-07-01',
    });
    expect(finding.contradicted).toBe(false);
  });

  it('does not flag a contradiction when new evidence is merely STABLE', () => {
    const finding = detectDirectionalContradiction({
      metric: 'Operating Margin',
      claimDirection: 'INCREASING',
      claimDescription: 'Operating margins are expanding.',
      claimAsOfDate: '2026-01-15',
      newEvidenceDirection: 'STABLE',
      newEvidenceDescription: 'Operating margin held steady.',
      newEvidenceAsOfDate: '2026-07-01',
    });
    expect(finding.contradicted).toBe(false);
  });
});
