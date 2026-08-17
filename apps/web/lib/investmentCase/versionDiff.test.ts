import { describe, expect, it } from 'vitest';
import { diffCaseSnapshots } from './versionDiff';
import type { CaseSnapshot } from './types';

function makeSnapshot(overrides: Partial<CaseSnapshot> = {}): CaseSnapshot {
  return {
    ticker: 'ACME',
    companyName: 'Acme Corp',
    businessOverview: { exchange: 'NASDAQ', sector: 'Technology', industry: 'Software', country: 'US', marketCap: 500_000_000_000 },
    status: 'ACTIVE_THESIS',
    horizon: '3-5 years',
    coreThesis: 'Cloud growth drives durable FCF expansion.',
    keyDrivers: ['Cloud growth', 'Margin expansion'],
    bullSummary: null,
    baseSummary: null,
    bearSummary: null,
    strengthenIndicators: ['Revenue acceleration'],
    weakenIndicators: ['Margin compression'],
    invalidateIndicators: ['Revenue growth below 5% for 4 quarters'],
    assumptions: [{ metric: 'REVENUE_CAGR', scenario: 'BASE', label: 'Revenue CAGR', value: 0.12, unit: 'ratio', confidence: 'MEDIUM' }],
    evidence: [
      { id: 'ev1', claim: 'Cloud growth strong', evidence: 'Q2 revenue up 20%', date: '2026-01-01', category: 'Growth', direction: 'SUPPORTS', strength: 'HIGH', sourceType: 'EARNINGS_CALL', sourceLabel: 'Q2 call' },
    ],
    risks: [],
    catalysts: [],
    invalidationCriteria: [],
    financials: { revenue: 100_000_000, revenueGrowth: 0.1, operatingMargin: 0.25, freeCashFlow: 20_000_000 },
    valuation: { currentSharePrice: 100, dcfBase: 120, dcfBull: 140, dcfBear: 90, compsImplied: 115, evToEbitda: 12, peRatio: 25 },
    capturedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('diffCaseSnapshots', () => {
  it('reports no changes between two identical snapshots', () => {
    const snap = makeSnapshot();
    const diff = diffCaseSnapshots(snap, snap);
    expect(diff.thesisChanges).toEqual([]);
    expect(diff.assumptionChanges).toEqual([]);
    expect(diff.addedEvidence).toEqual([]);
    expect(diff.removedEvidence).toEqual([]);
    expect(diff.valuationChanges).toEqual([]);
  });

  it('detects a status change and a horizon change', () => {
    const previous = makeSnapshot();
    const current = makeSnapshot({ status: 'THESIS_CHALLENGED', horizon: '5-7 years' });
    const diff = diffCaseSnapshots(previous, current);
    expect(diff.thesisChanges).toEqual(expect.arrayContaining([expect.stringContaining('Status changed from ACTIVE_THESIS to THESIS_CHALLENGED'), expect.stringContaining('Horizon changed')]));
  });

  it('detects an assumption value change', () => {
    const previous = makeSnapshot();
    const current = makeSnapshot({ assumptions: [{ metric: 'REVENUE_CAGR', scenario: 'BASE', label: 'Revenue CAGR', value: 0.09, unit: 'ratio', confidence: 'MEDIUM' }] });
    const diff = diffCaseSnapshots(previous, current);
    expect(diff.assumptionChanges).toHaveLength(1);
    expect(diff.assumptionChanges[0]).toMatchObject({ metric: 'REVENUE_CAGR', previousValue: 0.12, newValue: 0.09 });
  });

  it('detects added and removed evidence separately', () => {
    const previous = makeSnapshot();
    const current = makeSnapshot({
      evidence: [
        { id: 'ev2', claim: 'New competitor entered', evidence: '...', date: '2026-02-01', category: 'Competition', direction: 'CONTRADICTS', strength: 'MEDIUM', sourceType: 'EIGHT_K', sourceLabel: '8-K' },
      ],
    });
    const diff = diffCaseSnapshots(previous, current);
    expect(diff.addedEvidence.map((e) => e.id)).toEqual(['ev2']);
    expect(diff.removedEvidence.map((e) => e.id)).toEqual(['ev1']);
  });

  it('detects valuation changes by label', () => {
    const previous = makeSnapshot();
    const current = makeSnapshot({ valuation: { ...makeSnapshot().valuation, dcfBase: 130 } });
    const diff = diffCaseSnapshots(previous, current);
    expect(diff.valuationChanges).toEqual([{ label: 'DCF Base Case', previousValue: 120, newValue: 130 }]);
  });
});
