import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ResearchContext, ResearchDcfAnalysis, ResearchEarningsContext, ResearchFinancialMetricSeries } from '@/lib/research/types';
import type { ResearchReportContent } from '@/lib/services/researchReportService';
import { db } from '@/lib/db';
import { deriveThesisAssumptions } from './thesisMonitorService';

vi.mock('@/lib/services/researchReportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/researchReportService')>();
  return { ...actual, listReports: vi.fn() };
});
vi.mock('@/lib/valuation/quickValuation', () => ({ getQuickFundamentals: vi.fn(), getQuickDcf: vi.fn() }));

import { listReports } from '@/lib/services/researchReportService';
import { getQuickDcf, getQuickFundamentals } from '@/lib/valuation/quickValuation';
import { getThesisMonitor } from './thesisMonitorService';

// ---------------------------------------------------------------------------
// Pure extraction tests — no DB, no mocks.
// ---------------------------------------------------------------------------

function makeDcf(overrides: Partial<ResearchDcfAnalysis['scenarios'][number]> = {}): ResearchDcfAnalysis {
  return {
    currentSharePrice: 100,
    forecastYears: 5,
    scenarios: [
      {
        label: 'Base',
        finalYearRevenue: 1_610_510_000, // 1,000,000,000 grown at 10% CAGR for 5 years
        finalYearOperatingMargin: 0.25,
        finalYearUnleveredFcf: 300_000_000,
        wacc: 0.09,
        terminalGrowthRate: 0.025,
        terminalValueSharePct: 0.6,
        enterpriseValue: 20_000_000_000,
        equityValue: 18_000_000_000,
        impliedSharePrice: 120,
        upsideDownside: 0.2,
        isValid: true,
        issues: [],
        ...overrides,
      },
    ],
    sourceId: 2,
  };
}

function makeRevenueMetric(latestValue: number): ResearchFinancialMetricSeries {
  return { label: 'Revenue', changeKind: 'growth', values: [{ fiscalYear: 2025, value: latestValue }], latestYoyChange: 0.1 };
}

function makeEarningsContext(guidance: ResearchEarningsContext['guidance']): ResearchEarningsContext {
  return { call: { id: 'call-1', fiscalYear: 2026, fiscalQuarter: 2, callDate: '2026-07-01' }, analysis: null, guidance, sourceId: 5 };
}

function makeContext(overrides: Partial<ResearchContext> = {}): ResearchContext {
  return {
    ticker: 'ACME',
    companyOverview: { ticker: 'ACME', name: 'Acme Corp', sector: null, industry: null, exchange: null, country: null, price: 100, marketCap: 1_000_000, enterpriseValue: 1_000_000, beta: null, yearHigh: null, yearLow: null, quoteStale: false },
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

function makeContent(overrides: Partial<ResearchContext> = {}): ResearchReportContent {
  return { context: makeContext(overrides), report: null };
}

describe('deriveThesisAssumptions', () => {
  it('extracts WACC, terminal growth, operating margin, FCF margin, and revenue CAGR from a full DCF Base case', () => {
    const content = makeContent({ dcfAnalysis: makeDcf(), financialPerformance: { periodType: 'annual', metrics: [makeRevenueMetric(1_000_000_000)], dataAsOf: null, stale: false, sourceId: 1 } });

    const rows = deriveThesisAssumptions(content);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

    expect(byKey.WACC?.value).toBeCloseTo(0.09);
    expect(byKey.TERMINAL_GROWTH?.value).toBeCloseTo(0.025);
    expect(byKey.OPERATING_MARGIN?.value).toBeCloseTo(0.25);
    expect(byKey.FCF_MARGIN?.value).toBeCloseTo(300_000_000 / 1_610_510_000);
    expect(byKey.REVENUE_CAGR?.value).toBeCloseTo(0.1, 2);
  });

  it('extracts revenue guidance when present, matched case-insensitively by metric label', () => {
    const content = makeContent({ earningsContext: makeEarningsContext([{ metricLabel: 'Revenue', period: 'FY2026', low: 10, high: 11, midpoint: 10.5, change: 'INCREASED' }]) });
    const rows = deriveThesisAssumptions(content);
    const guidance = rows.find((r) => r.key === 'REVENUE_GUIDANCE');
    expect(guidance).toMatchObject({ value: 10.5, label: 'Revenue Guidance (FY2026)' });
  });

  it('never fabricates an assumption for missing data — no DCF, no guidance, no revenue history', () => {
    const rows = deriveThesisAssumptions(makeContent());
    expect(rows).toEqual([]);
  });

  it('omits Revenue CAGR when there is no historical revenue to compare the forecast against', () => {
    const content = makeContent({ dcfAnalysis: makeDcf() }); // no financialPerformance revenue series
    const rows = deriveThesisAssumptions(content);
    expect(rows.find((r) => r.key === 'REVENUE_CAGR')).toBeUndefined();
    expect(rows.find((r) => r.key === 'WACC')).toBeDefined();
  });

  it('omits guidance not labeled as revenue', () => {
    const content = makeContent({ earningsContext: makeEarningsContext([{ metricLabel: 'EPS', period: 'FY2026', low: 1, high: 1.1, midpoint: 1.05, change: 'MAINTAINED' }]) });
    const rows = deriveThesisAssumptions(content);
    expect(rows.find((r) => r.key === 'REVENUE_GUIDANCE')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getThesisMonitor — integration against the real local Postgres (assumption
// extraction is persisted, comparisons are persisted and deduplicated).
// ---------------------------------------------------------------------------

const TICKER = 'ZZTHESIS';

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

function resetMocks() {
  vi.mocked(listReports).mockReset().mockResolvedValue([]);
  vi.mocked(getQuickFundamentals).mockReset().mockResolvedValue(null);
  vi.mocked(getQuickDcf).mockReset().mockResolvedValue(null);
}

describe('getThesisMonitor', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.researchEvent.deleteMany({ where: { company: { ticker: TICKER } } });
    await db.researchReport.deleteMany({ where: { company: { ticker: TICKER } } });
  });

  it('returns null when the company has no successful research report', async () => {
    resetMocks();
    await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Thesis Co.' }, update: {} });
    expect(await getThesisMonitor(TICKER)).toBeNull();
  });

  it('extracts assumptions once, flags a guidance change that conflicts with the assumption, and never overwrites the original assumption value', async () => {
    resetMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Thesis Co.' }, update: {} });
    const report = await db.researchReport.create({
      data: {
        companyId: company.id,
        version: 1,
        status: 'SUCCESS',
        model: 'claude-sonnet-4-5',
        dataSnapshotAt: new Date(),
        content: makeContent({
          dcfAnalysis: makeDcf(),
          financialPerformance: { periodType: 'annual', metrics: [makeRevenueMetric(1_000_000_000)], dataAsOf: null, stale: false, sourceId: 1 },
          earningsContext: makeEarningsContext([{ metricLabel: 'Revenue', period: 'FY2026', low: 10, high: 11, midpoint: 11.0, change: 'MAINTAINED' }]),
        }) as never,
      },
    });
    vi.mocked(listReports).mockResolvedValue([report] as never);
    vi.mocked(getQuickFundamentals).mockResolvedValue(null);
    vi.mocked(getQuickDcf).mockResolvedValue(null);

    // Seed a detected guidance-cut event whose ResearchEventChange gives the new revenue-guidance midpoint.
    const event = await db.researchEvent.create({
      data: {
        companyId: company.id,
        category: 'EARNINGS',
        type: 'GUIDANCE_CHANGE',
        title: 'Guidance lowered for Revenue (FY2026)',
        description: 'test',
        materiality: 'HIGH',
        confidence: 'HIGH',
        dedupeKey: 'guidance:REVENUE:FY2026',
        eventDate: new Date(),
        changes: { create: [{ metric: 'Revenue Guidance (Midpoint)', unit: 'usd', previousValue: 11.0, currentValue: 9.2, changeAbsolute: -1.8, changePercent: -0.1636 }] },
      },
    });

    const result = await getThesisMonitor(TICKER);
    expect(result?.reportVersion).toBe(1);

    const revenueGuidance = result?.assumptions.find((a) => a.key === 'REVENUE_GUIDANCE');
    expect(revenueGuidance?.originalValue).toBe(11.0);
    expect(revenueGuidance?.latestComparison?.newValue).toBe(9.2);
    expect(revenueGuidance?.latestComparison?.flagged).toBe(true);
    expect(revenueGuidance?.latestComparison?.note).toContain('Potentially inconsistent');
    expect(revenueGuidance?.latestComparison?.note).not.toContain('Thesis broken');
    expect(revenueGuidance?.latestComparison?.researchEventId).toBe(event.id);

    // Assumption extraction ran once — a second call reuses the same stored rows rather than re-extracting.
    const storedAssumptions = await db.thesisAssumption.findMany({ where: { researchReportId: report.id } });
    await getThesisMonitor(TICKER);
    expect(await db.thesisAssumption.count({ where: { researchReportId: report.id } })).toBe(storedAssumptions.length);
  });

  it('does not fabricate a comparison when no live value is available for an assumption', async () => {
    resetMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Thesis Co.' }, update: {} });
    const report = await db.researchReport.create({
      data: {
        companyId: company.id,
        version: 1,
        status: 'SUCCESS',
        model: 'claude-sonnet-4-5',
        dataSnapshotAt: new Date(),
        content: makeContent({ dcfAnalysis: makeDcf() }) as never, // WACC/terminal growth/operating margin present, no revenue history, no guidance
      },
    });
    vi.mocked(listReports).mockResolvedValue([report] as never);
    vi.mocked(getQuickFundamentals).mockResolvedValue(null);
    vi.mocked(getQuickDcf).mockResolvedValue(null);

    const result = await getThesisMonitor(TICKER);
    const wacc = result?.assumptions.find((a) => a.key === 'WACC');
    expect(wacc?.latestComparison).toBeNull();
  });

  it('avoids writing a duplicate comparison row when the live value has not changed since the last check', async () => {
    resetMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Thesis Co.' }, update: {} });
    const report = await db.researchReport.create({
      data: {
        companyId: company.id,
        version: 1,
        status: 'SUCCESS',
        model: 'claude-sonnet-4-5',
        dataSnapshotAt: new Date(),
        content: makeContent({ dcfAnalysis: makeDcf() }) as never,
      },
    });
    vi.mocked(listReports).mockResolvedValue([report] as never);
    vi.mocked(getQuickDcf).mockResolvedValue({ currentSharePrice: 100, impliedSharePrice: 120, upsideDownside: 0.2, isValid: true, wacc: 0.11 });

    await getThesisMonitor(TICKER);
    await getThesisMonitor(TICKER);

    const assumption = await db.thesisAssumption.findFirstOrThrow({ where: { researchReportId: report.id, key: 'WACC' } });
    expect(await db.assumptionComparison.count({ where: { assumptionId: assumption.id } })).toBe(1);
  });
});
