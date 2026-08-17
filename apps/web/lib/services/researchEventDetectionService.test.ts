import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FinancialPeriodData } from '@erp/types';
import { db } from '@/lib/db';

/**
 * Integration test against the real local Postgres — deduplication,
 * idempotency, and AI-failure resilience are all claims about actual
 * stored rows, not something a mock can verify. Every external service
 * (financial data, SEC filings, earnings calls, research reports, quick
 * valuation, the LLM) is mocked so this test never makes a real network
 * call.
 */

vi.mock('@/lib/services/financialDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/financialDataService')>();
  return { ...actual, getFinancials: vi.fn() };
});
vi.mock('@/lib/services/secFilingService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/secFilingService')>();
  return { ...actual, listFilings: vi.fn(), findPreviousFiling: vi.fn(), getExistingComparison: vi.fn() };
});
vi.mock('@/lib/services/earningsCallService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/earningsCallService')>();
  return { ...actual, listEarningsCalls: vi.fn(), getGuidanceObservations: vi.fn() };
});
vi.mock('@/lib/services/researchReportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/researchReportService')>();
  return { ...actual, listReports: vi.fn() };
});
vi.mock('@/lib/valuation/quickValuation', () => ({ getQuickDcf: vi.fn(), getQuickComps: vi.fn() }));
vi.mock('@/lib/ai/anthropicClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/anthropicClient')>();
  return { ...actual, requestStructuredCompletion: vi.fn(), isAiConfigured: vi.fn() };
});

import { getFinancials } from '@/lib/services/financialDataService';
import { findPreviousFiling, getExistingComparison, listFilings } from '@/lib/services/secFilingService';
import { getGuidanceObservations, listEarningsCalls } from '@/lib/services/earningsCallService';
import { listReports } from '@/lib/services/researchReportService';
import { getQuickComps, getQuickDcf } from '@/lib/valuation/quickValuation';
import { isAiConfigured, requestStructuredCompletion, AiNotConfiguredError } from '@/lib/ai/anthropicClient';
import { runResearchEventDetection } from './researchEventDetectionService';

const TICKER = 'ZZEVENTDETECT';

function makePeriod(fiscalYear: number, revenue: number, operatingMarginPct: number): FinancialPeriodData {
  const operatingIncome = revenue * operatingMarginPct;
  return {
    fiscalYear,
    fiscalPeriod: 'FY',
    periodType: 'annual',
    periodStart: `${fiscalYear - 1}-01-01`,
    periodEnd: `${fiscalYear}-12-31`,
    filingType: '10-K',
    filingDate: `${fiscalYear + 1}-02-01`,
    incomeStatement: {
      revenue,
      costOfRevenue: revenue * 0.4,
      grossProfit: revenue * 0.6,
      operatingExpenses: null,
      operatingIncome,
      interestExpense: null,
      pretaxIncome: null,
      incomeTax: null,
      netIncome: operatingIncome * 0.8,
      eps: null,
      dilutedEps: operatingIncome / 1_000_000_000,
      basicSharesOutstanding: null,
      dilutedSharesOutstanding: 1_000_000_000,
    },
    balanceSheet: {
      cashAndEquivalents: revenue * 0.2,
      shortTermInvestments: null,
      accountsReceivable: null,
      inventory: null,
      totalCurrentAssets: null,
      ppe: null,
      goodwill: null,
      intangibleAssets: null,
      totalAssets: null,
      accountsPayable: null,
      shortTermDebt: revenue * 0.05,
      longTermDebt: revenue * 0.1,
      totalCurrentLiabilities: null,
      totalLiabilities: null,
      stockholdersEquity: null,
    },
    cashFlow: {
      operatingCashFlow: null,
      capex: null,
      investingCashFlow: null,
      financingCashFlow: null,
      freeCashFlow: revenue * 0.15,
      depreciationAmortization: null,
      stockBasedCompensation: null,
      changeInWorkingCapital: null,
    },
  };
}

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

/**
 * ResearchEventSource has real FKs to SecFiling/EarningsCall/ResearchReport
 * (source traceability must point at an actual Atlas record, per the
 * milestone spec) — so detector mocks must return rows backed by real DB
 * ids, not arbitrary strings.
 */
async function createFiling(companyId: string, overrides: Partial<{ filingType: 'EIGHT_K' | 'TEN_Q' | 'TEN_K'; formType: string; items: string | null; filingDate: Date; accessionNumber: string }> = {}) {
  return db.secFiling.create({
    data: {
      companyId,
      filingType: overrides.filingType ?? 'TEN_Q',
      formType: overrides.formType ?? '10-Q',
      filingDate: overrides.filingDate ?? new Date('2026-08-01'),
      accessionNumber: overrides.accessionNumber ?? `ACC-${Math.random().toString(36).slice(2)}`,
      primaryDocument: 'doc.htm',
      secUrl: 'https://www.sec.gov/doc.htm',
      items: overrides.items ?? null,
    },
  });
}

async function createCall(companyId: string, overrides: Partial<{ fiscalYear: number; fiscalQuarter: number; callDate: Date }> = {}) {
  return db.earningsCall.create({
    data: {
      companyId,
      fiscalYear: overrides.fiscalYear ?? 2026,
      fiscalQuarter: overrides.fiscalQuarter ?? 3,
      callDate: overrides.callDate ?? new Date('2026-08-01'),
      provider: 'FMP',
    },
  });
}

function resetAllMocks() {
  vi.mocked(getFinancials).mockReset().mockResolvedValue({ ticker: TICKER, periodType: 'annual', periods: [], stale: false, dataAsOf: null });
  vi.mocked(listFilings).mockReset().mockResolvedValue([]);
  vi.mocked(findPreviousFiling).mockReset().mockResolvedValue(null);
  vi.mocked(getExistingComparison).mockReset().mockResolvedValue(null as never);
  vi.mocked(listEarningsCalls).mockReset().mockResolvedValue([]);
  vi.mocked(getGuidanceObservations).mockReset().mockResolvedValue([]);
  vi.mocked(listReports).mockReset().mockResolvedValue([]);
  vi.mocked(getQuickDcf).mockReset().mockResolvedValue(null);
  vi.mocked(getQuickComps).mockReset().mockResolvedValue(null);
  vi.mocked(isAiConfigured).mockReset().mockReturnValue(false);
  vi.mocked(requestStructuredCompletion).mockReset();
}

describe('runResearchEventDetection', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.researchEvent.deleteMany({ where: { company: { ticker: TICKER } } });
    await db.secFiling.deleteMany({ where: { company: { ticker: TICKER } } });
    await db.earningsCall.deleteMany({ where: { company: { ticker: TICKER } } });
  });

  it('returns zero counts for an unknown ticker rather than throwing', async () => {
    resetAllMocks();
    const result = await runResearchEventDetection('ZZNOTREAL');
    expect(result).toEqual({ created: 0, updated: 0, unchanged: 0 });
  });

  it('detects a financial + margin change event from two annual periods', async () => {
    resetAllMocks();
    await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    vi.mocked(getFinancials).mockResolvedValue({
      ticker: TICKER,
      periodType: 'annual',
      periods: [makePeriod(2025, 100, 0.2), makePeriod(2026, 110, 0.25)],
      stale: false,
      dataAsOf: '2027-01-01',
    });

    await runResearchEventDetection(TICKER);

    const events = await db.researchEvent.findMany({ where: { company: { ticker: TICKER } }, include: { changes: true } });
    const financial = events.find((e) => e.type === 'FINANCIAL_CHANGE');
    const margin = events.find((e) => e.type === 'MARGIN_CHANGE');

    expect(financial).toBeDefined();
    expect(financial?.changes.find((c) => c.metric === 'Revenue')?.changePercent).toBeCloseTo(0.1);
    expect(margin).toBeDefined();
    expect(margin?.changes.find((c) => c.metric === 'Operating Margin')?.changeAbsolute).toBeCloseTo(500, 0); // 20% -> 25% = +500bps
  });

  it('is idempotent — running detection twice does not duplicate events', async () => {
    resetAllMocks();
    await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    vi.mocked(getFinancials).mockResolvedValue({
      ticker: TICKER,
      periodType: 'annual',
      periods: [makePeriod(2025, 100, 0.2), makePeriod(2026, 110, 0.25)],
      stale: false,
      dataAsOf: '2027-01-01',
    });

    await runResearchEventDetection(TICKER);
    const firstCount = await db.researchEvent.count({ where: { company: { ticker: TICKER } } });
    await runResearchEventDetection(TICKER);
    const secondCount = await db.researchEvent.count({ where: { company: { ticker: TICKER } } });

    expect(secondCount).toBe(firstCount);
  });

  it('detects a guidance change and skips MAINTAINED guidance', async () => {
    resetAllMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    const call = await createCall(company.id);
    vi.mocked(listEarningsCalls).mockResolvedValue([{ id: call.id, fiscalYear: 2026, fiscalQuarter: 3, callDate: new Date('2026-08-01'), periodEndDate: null } as never]);
    vi.mocked(getGuidanceObservations).mockResolvedValue([
      { id: 'g1', earningsCallId: call.id, metric: 'REVENUE', metricLabel: 'Revenue', period: 'FY2026', low: 10, high: 11, midpoint: 11.0, priorLow: 9.5, priorHigh: 10.5, priorMidpoint: 10.5, change: 'INCREASED', sourceExcerpt: 'We now expect...', sourceAnchor: null, createdAt: new Date() } as never,
      { id: 'g2', earningsCallId: call.id, metric: 'EPS', metricLabel: 'EPS', period: 'FY2026', low: 1, high: 1.1, midpoint: 1.05, priorLow: 1, priorHigh: 1.1, priorMidpoint: 1.05, change: 'MAINTAINED', sourceExcerpt: 'unchanged', sourceAnchor: null, createdAt: new Date() } as never,
    ]);

    await runResearchEventDetection(TICKER);

    const events = await db.researchEvent.findMany({ where: { company: { ticker: TICKER }, type: 'GUIDANCE_CHANGE' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toContain('raised');
  });

  it('merges the same conceptual event surfaced via a second source into the existing event, rather than creating a duplicate', async () => {
    resetAllMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    const firstCall = await createCall(company.id, { fiscalYear: 2026, fiscalQuarter: 2 });

    vi.mocked(listEarningsCalls).mockResolvedValue([{ id: firstCall.id, fiscalYear: 2026, fiscalQuarter: 2, callDate: new Date('2026-05-01'), periodEndDate: null } as never]);
    vi.mocked(getGuidanceObservations).mockResolvedValue([
      { id: 'g1', earningsCallId: firstCall.id, metric: 'REVENUE', metricLabel: 'Revenue', period: 'FY2026', low: 10, high: 11, midpoint: 11.0, priorLow: 9.5, priorHigh: 10.5, priorMidpoint: 10.5, change: 'INCREASED', sourceExcerpt: 'Per the Q2 call...', sourceAnchor: null, createdAt: new Date() } as never,
    ]);
    await runResearchEventDetection(TICKER);

    const afterFirst = await db.researchEvent.findMany({ where: { company: { ticker: TICKER }, type: 'GUIDANCE_CHANGE' }, include: { sources: true } });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.sources).toHaveLength(1);
    const eventId = afterFirst[0]!.id;

    // A second, later earnings call corroborates the SAME conceptual
    // guidance change (same metric/period, same dedupeKey) from a
    // DIFFERENT source (a different earningsCallId) — per spec section 17,
    // this must append a source to the existing event, never create a
    // second ResearchEvent row for "the same event."
    const secondCall = await createCall(company.id, { fiscalYear: 2026, fiscalQuarter: 3 });
    vi.mocked(listEarningsCalls).mockResolvedValue([{ id: secondCall.id, fiscalYear: 2026, fiscalQuarter: 3, callDate: new Date('2026-08-01'), periodEndDate: null } as never]);
    vi.mocked(getGuidanceObservations).mockResolvedValue([
      { id: 'g2', earningsCallId: secondCall.id, metric: 'REVENUE', metricLabel: 'Revenue', period: 'FY2026', low: 10, high: 11, midpoint: 11.0, priorLow: 9.5, priorHigh: 10.5, priorMidpoint: 10.5, change: 'INCREASED', sourceExcerpt: 'Reaffirmed on the Q3 call...', sourceAnchor: null, createdAt: new Date() } as never,
    ]);
    await runResearchEventDetection(TICKER);

    const afterSecond = await db.researchEvent.findMany({ where: { company: { ticker: TICKER }, type: 'GUIDANCE_CHANGE' }, include: { sources: true } });
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.id).toBe(eventId);
    expect(afterSecond[0]?.sources).toHaveLength(2);
    expect(afterSecond[0]?.sources.map((s) => s.earningsCallId).sort()).toEqual([firstCall.id, secondCall.id].sort());
  });

  it('creates a DCF valuation change event only once a baseline exists, then dedupes same-day reruns', async () => {
    resetAllMocks();
    await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    vi.mocked(getQuickDcf).mockResolvedValue({ currentSharePrice: 100, impliedSharePrice: 120, upsideDownside: 0.2, isValid: true, wacc: 0.09 });

    // No baseline yet (no report, no prior recorded change) -> no event.
    await runResearchEventDetection(TICKER);
    expect(await db.researchEvent.count({ where: { company: { ticker: TICKER }, type: 'DCF_VALUATION_CHANGE' } })).toBe(0);

    // Seed a baseline via a prior recorded change for this exact metric.
    const seedEvent = await db.researchEvent.create({
      data: {
        companyId: (await db.company.findUniqueOrThrow({ where: { ticker: TICKER } })).id,
        category: 'VALUATION',
        type: 'DCF_VALUATION_CHANGE',
        title: 'seed',
        description: 'seed',
        materiality: 'LOW',
        confidence: 'HIGH',
        dedupeKey: 'dcf:base:seed',
        eventDate: new Date(),
        changes: { create: [{ metric: 'DCF Implied Price (Base)', unit: 'usd_per_share', previousValue: 90, currentValue: 100, changeAbsolute: 10, changePercent: 0.111 }] },
      },
    });
    expect(seedEvent).toBeTruthy();

    await runResearchEventDetection(TICKER);
    expect(await db.researchEvent.count({ where: { company: { ticker: TICKER }, type: 'DCF_VALUATION_CHANGE', NOT: { dedupeKey: 'dcf:base:seed' } } })).toBe(1);

    // Re-running the same day must not create a second event.
    await runResearchEventDetection(TICKER);
    expect(await db.researchEvent.count({ where: { company: { ticker: TICKER }, type: 'DCF_VALUATION_CHANGE', NOT: { dedupeKey: 'dcf:base:seed' } } })).toBe(1);
  });

  it('classifies an acquisition 8-K as a CORPORATE_EVENT, distinct from a routine 10-Q', async () => {
    resetAllMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    const eightK = await createFiling(company.id, { filingType: 'EIGHT_K', formType: '8-K', filingDate: new Date('2026-08-05'), accessionNumber: 'ACC-EIGHTK', items: '2.01' });
    const tenQ = await createFiling(company.id, { filingType: 'TEN_Q', formType: '10-Q', filingDate: new Date('2026-08-01'), accessionNumber: 'ACC-TENQ', items: null });
    vi.mocked(listFilings).mockResolvedValue([
      { id: eightK.id, formType: '8-K', filingType: 'EIGHT_K', filingDate: new Date('2026-08-05'), accessionNumber: 'ACC-EIGHTK', items: '2.01' } as never,
      { id: tenQ.id, formType: '10-Q', filingType: 'TEN_Q', filingDate: new Date('2026-08-01'), accessionNumber: 'ACC-TENQ', items: null } as never,
    ]);

    await runResearchEventDetection(TICKER);

    const corporate = await db.researchEvent.findFirst({ where: { company: { ticker: TICKER }, type: 'CORPORATE_EVENT' } });
    const filing = await db.researchEvent.findFirst({ where: { company: { ticker: TICKER }, type: 'NEW_FILING' } });

    expect(corporate?.materiality).toBe('HIGH');
    expect(filing).toBeDefined();
  });

  it('surfaces a new risk from an already-computed FilingComparison without triggering a new AI call', async () => {
    resetAllMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    const latestFiling = await createFiling(company.id, { filingType: 'TEN_Q', formType: '10-Q', filingDate: new Date('2026-08-01'), accessionNumber: 'ACC-LATEST', items: null });
    const previousFiling = await createFiling(company.id, { filingType: 'TEN_Q', formType: '10-Q', filingDate: new Date('2026-05-01'), accessionNumber: 'ACC-PREVIOUS', items: null });
    vi.mocked(listFilings).mockResolvedValue([{ id: latestFiling.id, formType: '10-Q', filingType: 'TEN_Q', filingDate: new Date('2026-08-01'), accessionNumber: 'ACC-LATEST', items: null } as never]);
    vi.mocked(findPreviousFiling).mockResolvedValue({ id: previousFiling.id, formType: '10-Q', filingDate: new Date('2026-05-01') } as never);
    vi.mocked(getExistingComparison).mockResolvedValue({
      status: 'SUCCESS',
      newRisks: [{ description: 'New supply-chain risk disclosed.', source: { section: 'Risk Factors', excerpt: 'We now face...' } }],
    } as never);

    await runResearchEventDetection(TICKER);

    const risk = await db.researchEvent.findFirst({ where: { company: { ticker: TICKER }, type: 'NEW_RISK' } });
    expect(risk?.description).toBe('New supply-chain risk disclosed.');
    expect(risk?.confidence).toBe('MEDIUM');
  });

  it('creates a HIGH-materiality event with AI explanation when AI is configured and succeeds', async () => {
    resetAllMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    const call = await createCall(company.id);
    vi.mocked(isAiConfigured).mockReturnValue(true);
    vi.mocked(listEarningsCalls).mockResolvedValue([{ id: call.id, fiscalYear: 2026, fiscalQuarter: 3, callDate: new Date('2026-08-01'), periodEndDate: null } as never]);
    vi.mocked(getGuidanceObservations).mockResolvedValue([
      { id: 'g1', earningsCallId: call.id, metric: 'REVENUE', metricLabel: 'Revenue', period: 'FY2026', low: 9, high: 9.5, midpoint: 9.2, priorLow: 10.5, priorHigh: 11.5, priorMidpoint: 11.0, change: 'DECREASED', sourceExcerpt: 'We are lowering...', sourceAnchor: null, createdAt: new Date() } as never,
    ]);
    vi.mocked(requestStructuredCompletion).mockResolvedValue({
      data: {
        summary: 'Revenue guidance was cut.',
        why_it_matters: 'Below the growth assumption in the research report.',
        affected_research_areas: ['DCF', 'FINANCIALS'],
        questions_to_investigate: ['What drove the cut?'],
        confidence: 'high',
      },
      model: 'claude-sonnet-4-5',
      inputTokens: 200,
      outputTokens: 80,
    });

    await runResearchEventDetection(TICKER);

    const event = await db.researchEvent.findFirst({ where: { company: { ticker: TICKER }, type: 'GUIDANCE_CHANGE' } });
    expect(event?.materiality).toBe('HIGH');
    expect(event?.aiStatus).toBe('SUCCESS');
    expect(event?.aiSummary).toContain('cut');
  });

  it('keeps a source-backed event fully available when the AI call fails', async () => {
    resetAllMocks();
    const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    const call = await createCall(company.id);
    vi.mocked(isAiConfigured).mockReturnValue(true);
    vi.mocked(listEarningsCalls).mockResolvedValue([{ id: call.id, fiscalYear: 2026, fiscalQuarter: 3, callDate: new Date('2026-08-01'), periodEndDate: null } as never]);
    vi.mocked(getGuidanceObservations).mockResolvedValue([
      { id: 'g1', earningsCallId: call.id, metric: 'REVENUE', metricLabel: 'Revenue', period: 'FY2026', low: 9, high: 9.5, midpoint: 9.2, priorLow: 10.5, priorHigh: 11.5, priorMidpoint: 11.0, change: 'DECREASED', sourceExcerpt: 'We are lowering...', sourceAnchor: null, createdAt: new Date() } as never,
    ]);
    vi.mocked(requestStructuredCompletion).mockRejectedValue(new AiNotConfiguredError());

    await runResearchEventDetection(TICKER);

    const event = await db.researchEvent.findFirst({ where: { company: { ticker: TICKER }, type: 'GUIDANCE_CHANGE' }, include: { sources: true, changes: true } });
    expect(event).toBeDefined();
    expect(event?.aiStatus).toBe('FAILED');
    expect(event?.sources.length).toBeGreaterThan(0);
    expect(event?.changes.length).toBeGreaterThan(0);
  });

  it('never invokes AI for a LOW/MEDIUM-materiality event (cost control)', async () => {
    resetAllMocks();
    await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Event Detect Co.' }, update: {} });
    vi.mocked(isAiConfigured).mockReturnValue(true);
    vi.mocked(getFinancials).mockResolvedValue({
      ticker: TICKER,
      periodType: 'annual',
      periods: [makePeriod(2025, 100, 0.2), makePeriod(2026, 101, 0.201)], // trivial change -> LOW
      stale: false,
      dataAsOf: '2027-01-01',
    });

    await runResearchEventDetection(TICKER);
    expect(requestStructuredCompletion).not.toHaveBeenCalled();
  });
});
