import { describe, expect, it } from 'vitest';
import type { ResearchContext, ResearchDcfAnalysis, ResearchEarningsContext } from './types';
import type { ResearchReportAiPayload } from '@/lib/ai/reportSchema';
import type { ResearchReportContent } from '@/lib/services/researchReportService';
import { compareResearchReports } from './compareReports';

function makeDcf(impliedSharePrice: number, finalYearRevenue: number, finalYearOperatingMargin: number): ResearchDcfAnalysis {
  return {
    currentSharePrice: 100,
    forecastYears: 5,
    scenarios: [
      {
        label: 'Base',
        finalYearRevenue,
        finalYearOperatingMargin,
        finalYearUnleveredFcf: 1000,
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

function makeEarningsContext(guidance: ResearchEarningsContext['guidance']): ResearchEarningsContext {
  return {
    call: { id: 'call-1', fiscalYear: 2026, fiscalQuarter: 2, callDate: '2026-07-01' },
    analysis: null,
    guidance,
    sourceId: 5,
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
    conclusion: {
      what_is_working: 'x',
      what_is_deteriorating: 'x',
      valuation_implication: 'x',
      key_assumptions: 'x',
      what_could_change_thesis: 'x',
      source_ids: [],
    },
    ...overrides,
  };
}

describe('compareResearchReports', () => {
  it('computes DCF implied price, revenue forecast, and margin forecast deltas', () => {
    const previous: { version: number; content: ResearchReportContent } = {
      version: 1,
      content: { context: makeContext({ dcfAnalysis: makeDcf(100, 1000, 0.2) }), report: makePayload() },
    };
    const current: { version: number; content: ResearchReportContent } = {
      version: 2,
      content: { context: makeContext({ dcfAnalysis: makeDcf(110, 1100, 0.22) }), report: makePayload() },
    };

    const diff = compareResearchReports(current, previous);

    expect(diff.dcfImpliedPriceChange).toEqual({ previous: 100, current: 110, delta: 10, percentChange: 0.1 });
    expect(diff.revenueForecastChange.delta).toBe(100);
    expect(diff.marginForecastChange.delta).toBeCloseTo(0.02);
  });

  it('handles a missing DCF in either version without throwing', () => {
    const previous: { version: number; content: ResearchReportContent } = {
      version: 1,
      content: { context: makeContext({ dcfAnalysis: null }), report: makePayload() },
    };
    const current: { version: number; content: ResearchReportContent } = {
      version: 2,
      content: { context: makeContext({ dcfAnalysis: makeDcf(110, 1100, 0.22) }), report: makePayload() },
    };

    const diff = compareResearchReports(current, previous);
    expect(diff.dcfImpliedPriceChange).toEqual({ previous: null, current: 110, delta: null, percentChange: null });
  });

  it('identifies new and removed risks by exact text', () => {
    const previous: { version: number; content: ResearchReportContent } = {
      version: 1,
      content: {
        context: makeContext(),
        report: makePayload({
          risks: [
            { category: 'competitive', risk: 'Rising competition.', why_it_matters: 'x', evidence: 'x', source_ids: [] },
            { category: 'regulatory', risk: 'Pending litigation.', why_it_matters: 'x', evidence: 'x', source_ids: [] },
          ],
        }),
      },
    };
    const current: { version: number; content: ResearchReportContent } = {
      version: 2,
      content: {
        context: makeContext(),
        report: makePayload({
          risks: [
            { category: 'competitive', risk: 'Rising competition.', why_it_matters: 'x', evidence: 'x', source_ids: [] },
            { category: 'macroeconomic', risk: 'FX headwinds.', why_it_matters: 'x', evidence: 'x', source_ids: [] },
          ],
        }),
      },
    };

    const diff = compareResearchReports(current, previous);
    expect(diff.newRisks).toEqual(['FX headwinds.']);
    expect(diff.removedRisks).toEqual(['Pending litigation.']);
  });

  it('identifies new and removed catalysts', () => {
    const previous: { version: number; content: ResearchReportContent } = {
      version: 1,
      content: { context: makeContext(), report: makePayload({ catalysts: [{ category: 'earnings', description: 'Q3 earnings.', source_ids: [] }] }) },
    };
    const current: { version: number; content: ResearchReportContent } = {
      version: 2,
      content: { context: makeContext(), report: makePayload({ catalysts: [{ category: 'new_products', description: 'New launch.', source_ids: [] }] }) },
    };

    const diff = compareResearchReports(current, previous);
    expect(diff.newCatalysts).toEqual(['New launch.']);
    expect(diff.removedCatalysts).toEqual(['Q3 earnings.']);
  });

  it('flags a guidance change for the same metric/period when midpoint or change label differs', () => {
    const previous: { version: number; content: ResearchReportContent } = {
      version: 1,
      content: {
        context: makeContext({
          earningsContext: makeEarningsContext([{ metricLabel: 'Revenue', period: 'Q3 2026', low: 100, high: 110, midpoint: 105, change: 'MAINTAINED' }]),
        }),
        report: makePayload(),
      },
    };
    const current: { version: number; content: ResearchReportContent } = {
      version: 2,
      content: {
        context: makeContext({
          earningsContext: makeEarningsContext([{ metricLabel: 'Revenue', period: 'Q3 2026', low: 110, high: 120, midpoint: 115, change: 'INCREASED' }]),
        }),
        report: makePayload(),
      },
    };

    const diff = compareResearchReports(current, previous);
    expect(diff.guidanceChanges).toHaveLength(1);
    expect(diff.guidanceChanges[0]).toMatchObject({ metricLabel: 'Revenue', previousMidpoint: 105, currentMidpoint: 115, currentChange: 'INCREASED' });
  });

  it('does not report a guidance change when nothing actually changed', () => {
    const guidance: ResearchEarningsContext['guidance'] = [{ metricLabel: 'Revenue', period: 'Q3 2026', low: 100, high: 110, midpoint: 105, change: 'MAINTAINED' }];
    const previous: { version: number; content: ResearchReportContent } = {
      version: 1,
      content: { context: makeContext({ earningsContext: makeEarningsContext(guidance) }), report: makePayload() },
    };
    const current: { version: number; content: ResearchReportContent } = {
      version: 2,
      content: { context: makeContext({ earningsContext: makeEarningsContext(guidance) }), report: makePayload() },
    };

    expect(compareResearchReports(current, previous).guidanceChanges).toEqual([]);
  });
});
