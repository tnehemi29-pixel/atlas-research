import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchContext, ResearchDcfAnalysis } from '@/lib/research/types';
import type { ResearchReportAiPayload } from '@/lib/ai/reportSchema';
import type { ResearchReportContent } from '@/lib/services/researchReportService';

vi.mock('@/lib/services/followedCompaniesService', () => ({
  getFollowedCompanies: vi.fn(),
}));
vi.mock('@/lib/services/secFilingService', () => ({
  listFilings: vi.fn(),
}));
vi.mock('@/lib/services/earningsCallService', () => ({
  listEarningsCalls: vi.fn(),
}));
vi.mock('@/lib/services/researchReportService', () => ({
  listReports: vi.fn(),
}));

import { getFollowedCompanies } from '@/lib/services/followedCompaniesService';
import { listFilings } from '@/lib/services/secFilingService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { listReports } from '@/lib/services/researchReportService';
import { getResearchFeed } from './researchFeedService';

function makeDcf(impliedSharePrice: number): ResearchDcfAnalysis {
  return {
    currentSharePrice: 100,
    forecastYears: 5,
    scenarios: [
      {
        label: 'Base',
        finalYearRevenue: 1000,
        finalYearOperatingMargin: 0.2,
        finalYearUnleveredFcf: 100,
        wacc: 0.09,
        terminalGrowthRate: 0.025,
        terminalValueSharePct: 0.6,
        enterpriseValue: 1_000_000,
        equityValue: 900_000,
        impliedSharePrice,
        upsideDownside: (impliedSharePrice - 100) / 100,
        isValid: true,
        issues: [],
      },
    ],
    sourceId: 2,
  };
}

function makeContext(overrides: Partial<ResearchContext> = {}): ResearchContext {
  return {
    ticker: 'ACME',
    companyOverview: {
      ticker: 'ACME',
      name: 'Acme Corp',
      sector: null,
      industry: null,
      exchange: null,
      country: null,
      price: 100,
      marketCap: 1_000_000,
      enterpriseValue: 1_000_000,
      beta: null,
      yearHigh: null,
      yearLow: null,
      quoteStale: false,
    },
    financialPerformance: { periodType: 'annual', metrics: [], dataAsOf: null, stale: false, sourceId: 1 },
    dcfAnalysis: null,
    compsAnalysis: null,
    secFilingContext: null,
    earningsContext: null,
    keyMetrics: [],
    sources: [],
    dataSnapshotAt: '2026-08-01T00:00:00.000Z',
    warnings: [],
    ...overrides,
  };
}

function makePayload(overrides: Partial<ResearchReportAiPayload> = {}): ResearchReportAiPayload {
  return {
    executive_summary: { text: 'x', source_ids: [] },
    company_overview_narrative: { text: 'x', source_ids: [] },
    financial_analysis_narrative: { text: 'x', source_ids: [] },
    growth_analysis: { drivers: [] },
    valuation_commentary: { text: 'x', source_ids: [] },
    dcf_commentary: { text: 'x', source_ids: [] },
    comps_commentary: { text: 'x', source_ids: [] },
    sec_analysis: { insights: [] },
    earnings_analysis: { insights: [] },
    catalysts: [],
    risks: [],
    management_capital_allocation: { text: 'x', source_ids: [] },
    scenario_commentary: { text: 'x', source_ids: [] },
    conclusion: { what_is_working: 'x', what_is_deteriorating: 'x', valuation_implication: 'x', key_assumptions: 'x', what_could_change_thesis: 'x', source_ids: [] },
    ...overrides,
  };
}

function makeReport(version: number, content: ResearchReportContent) {
  return { id: `report-v${version}`, version, status: 'SUCCESS' as const, createdAt: new Date(`2026-0${version}-01`), content: content as never };
}

describe('getResearchFeed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a filing item, a call item, and a new-research-report item for a company with no history', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([{ id: 'c1', ticker: 'ACME', name: 'Acme Corp', sources: [] }]);
    vi.mocked(listFilings).mockResolvedValue([{ id: 'f1', formType: '10-Q', filingDate: new Date('2026-08-01') } as never]);
    vi.mocked(listEarningsCalls).mockResolvedValue([{ id: 'c1', fiscalYear: 2026, fiscalQuarter: 2, callDate: new Date('2026-07-01') } as never]);
    vi.mocked(listReports).mockResolvedValue([makeReport(1, { context: makeContext(), report: makePayload() }) as never]);

    const feed = await getResearchFeed('user-1');
    expect(feed.map((i) => i.type).sort()).toEqual(['NEW_EARNINGS_CALL', 'NEW_RESEARCH_REPORT', 'NEW_SEC_FILING']);
  });

  it('emits a VALUATION_CHANGE item when the DCF implied price moves materially between versions', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([{ id: 'c1', ticker: 'ACME', name: 'Acme Corp', sources: [] }]);
    vi.mocked(listFilings).mockResolvedValue([]);
    vi.mocked(listEarningsCalls).mockResolvedValue([]);
    vi.mocked(listReports).mockResolvedValue([
      makeReport(2, { context: makeContext({ dcfAnalysis: makeDcf(120) }), report: makePayload() }) as never,
      makeReport(1, { context: makeContext({ dcfAnalysis: makeDcf(100) }), report: makePayload() }) as never,
    ]);

    const feed = await getResearchFeed('user-1');
    const valuationItem = feed.find((i) => i.type === 'VALUATION_CHANGE');
    expect(valuationItem).toBeDefined();
    expect(valuationItem?.title).toContain('+20.0%');
  });

  it('does not emit VALUATION_CHANGE for a small, sub-threshold move', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([{ id: 'c1', ticker: 'ACME', name: 'Acme Corp', sources: [] }]);
    vi.mocked(listFilings).mockResolvedValue([]);
    vi.mocked(listEarningsCalls).mockResolvedValue([]);
    vi.mocked(listReports).mockResolvedValue([
      makeReport(2, { context: makeContext({ dcfAnalysis: makeDcf(101) }), report: makePayload() }) as never,
      makeReport(1, { context: makeContext({ dcfAnalysis: makeDcf(100) }), report: makePayload() }) as never,
    ]);

    const feed = await getResearchFeed('user-1');
    expect(feed.find((i) => i.type === 'VALUATION_CHANGE')).toBeUndefined();
  });

  it('emits a FILING_RISK item for a new_risk insight in the latest report', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([{ id: 'c1', ticker: 'ACME', name: 'Acme Corp', sources: [] }]);
    vi.mocked(listFilings).mockResolvedValue([]);
    vi.mocked(listEarningsCalls).mockResolvedValue([]);
    vi.mocked(listReports).mockResolvedValue([
      makeReport(1, {
        context: makeContext(),
        report: makePayload({ sec_analysis: { insights: [{ category: 'new_risk', description: 'New supply-chain risk disclosed.', source_ids: [] }] } }),
      }) as never,
    ]);

    const feed = await getResearchFeed('user-1');
    const riskItem = feed.find((i) => i.type === 'FILING_RISK');
    expect(riskItem?.description).toBe('New supply-chain risk disclosed.');
  });

  it('never returns items for a company the user does not follow', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([]);
    const feed = await getResearchFeed('user-1');
    expect(feed).toEqual([]);
    expect(listFilings).not.toHaveBeenCalled();
  });
});
