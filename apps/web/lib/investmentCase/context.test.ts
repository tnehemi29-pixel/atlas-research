import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/investmentCaseVersionService', () => ({ buildCaseSnapshot: vi.fn() }));
vi.mock('@/lib/services/investmentCaseChallengeService', () => ({ getThesisChallenges: vi.fn(), getInvalidationEvaluations: vi.fn() }));
vi.mock('@/lib/services/researchEventFeedService', () => ({ getCompanyTimeline: vi.fn() }));

import { buildCaseSnapshot } from '@/lib/services/investmentCaseVersionService';
import { getInvalidationEvaluations, getThesisChallenges } from '@/lib/services/investmentCaseChallengeService';
import { getCompanyTimeline } from '@/lib/services/researchEventFeedService';
import { buildInvestmentCaseContext, collectValidCitationIds } from './context';
import type { CaseSnapshot } from './types';

function makeSnapshot(): CaseSnapshot {
  return {
    ticker: 'ACME',
    companyName: 'Acme Corp',
    businessOverview: { exchange: 'NASDAQ', sector: 'Technology', industry: 'Software', country: 'US', marketCap: 500_000_000_000 },
    status: 'ACTIVE_THESIS',
    horizon: '3-5 years',
    coreThesis: 'Cloud growth drives FCF expansion.',
    keyDrivers: ['Cloud growth'],
    bullSummary: null,
    baseSummary: null,
    bearSummary: null,
    strengthenIndicators: [],
    weakenIndicators: [],
    invalidateIndicators: [],
    assumptions: [],
    evidence: [
      { id: 'ev1', claim: 'Cloud strong', evidence: 'Q2 up 20%', date: '2026-01-01', category: 'Growth', direction: 'SUPPORTS', strength: 'HIGH', sourceType: 'EARNINGS_CALL', sourceLabel: 'Q2 call' },
    ],
    risks: [],
    catalysts: [],
    invalidationCriteria: [],
    financials: { revenue: 100_000_000, revenueGrowth: 0.1, operatingMargin: 0.25, freeCashFlow: 20_000_000 },
    valuation: { currentSharePrice: 100, dcfBase: 120, dcfBull: 140, dcfBear: 90, compsImplied: 115, evToEbitda: 12, peRatio: 25 },
    capturedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('buildInvestmentCaseContext', () => {
  it('assembles the snapshot, challenges, invalidation evaluations, and a trimmed research-event timeline', async () => {
    vi.mocked(buildCaseSnapshot).mockResolvedValue(makeSnapshot());
    vi.mocked(getThesisChallenges).mockResolvedValue([]);
    vi.mocked(getInvalidationEvaluations).mockResolvedValue([]);
    vi.mocked(getCompanyTimeline).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `event-${i}`, category: 'FINANCIAL' as never, type: 'FINANCIAL_CHANGE' as never, title: `Event ${i}`, description: '', materiality: 'MEDIUM' as never, confidence: 'MEDIUM' as never, eventDate: '2026-01-01T00:00:00.000Z' })),
    );

    const context = await buildInvestmentCaseContext('user-1', 'case-1');
    expect(context.ticker).toBe('ACME');
    expect(context.evidence).toHaveLength(1);
    expect(context.recentResearchEvents).toHaveLength(15); // capped
    expect(getCompanyTimeline).toHaveBeenCalledWith('ACME');
  });

  it('collectValidCitationIds includes evidence and research-event ids, and nothing else', async () => {
    vi.mocked(buildCaseSnapshot).mockResolvedValue(makeSnapshot());
    vi.mocked(getThesisChallenges).mockResolvedValue([]);
    vi.mocked(getInvalidationEvaluations).mockResolvedValue([]);
    vi.mocked(getCompanyTimeline).mockResolvedValue([{ id: 'event-1', category: 'FINANCIAL' as never, type: 'FINANCIAL_CHANGE' as never, title: 'Event', description: '', materiality: 'MEDIUM' as never, confidence: 'MEDIUM' as never, eventDate: '2026-01-01T00:00:00.000Z' }]);

    const context = await buildInvestmentCaseContext('user-1', 'case-1');
    const ids = collectValidCitationIds(context);
    expect(ids.has('ev1')).toBe(true);
    expect(ids.has('event-1')).toBe(true);
    expect(ids.has('made-up-id')).toBe(false);
    expect(ids.size).toBe(2);
  });
});
