import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanyOverview, FinancialPeriodData } from '@erp/types';
import type { CompanyValuationMetrics, PeerCandidate } from '@/lib/comps/types';

/**
 * Unit tests for the research-data aggregator — every external service call
 * is mocked (companyService, financialDataService, compsDataService,
 * secFilingService, earningsCallService); the DCF and comps ENGINES
 * themselves run for real, since they're pure functions with no I/O. No
 * real network/DB calls are made, matching lib/ai/*.test.ts's mocking
 * convention rather than the real-Postgres integration pattern used for
 * *Service.ts files that own their own persistence.
 */

function makeOverview(overrides: Partial<CompanyOverview> = {}): CompanyOverview {
  return {
    ticker: 'ACME',
    name: 'Acme Corp',
    exchange: 'NASDAQ',
    sector: 'Technology',
    industry: 'Software',
    country: 'US',
    logoUrl: null,
    price: 100,
    changePercent: 1.2,
    marketCap: 500_000_000_000,
    yearHigh: 120,
    yearLow: 80,
    beta: 1.1,
    quoteUpdatedAt: new Date().toISOString(),
    stale: false,
    ...overrides,
  };
}

function makePeriod(fiscalYear: number, revenue: number): FinancialPeriodData {
  const grossProfit = revenue * 0.6;
  const operatingIncome = revenue * 0.3;
  const netIncome = revenue * 0.2;
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
      costOfRevenue: revenue - grossProfit,
      grossProfit,
      operatingExpenses: grossProfit - operatingIncome,
      operatingIncome,
      interestExpense: revenue * 0.01,
      pretaxIncome: operatingIncome,
      incomeTax: operatingIncome - netIncome,
      netIncome,
      eps: netIncome / 1_000_000_000,
      dilutedEps: netIncome / 1_010_000_000,
      basicSharesOutstanding: 1_000_000_000,
      dilutedSharesOutstanding: 1_010_000_000,
    },
    balanceSheet: {
      cashAndEquivalents: revenue * 0.3,
      shortTermInvestments: null,
      accountsReceivable: revenue * 0.1,
      inventory: null,
      totalCurrentAssets: revenue * 0.5,
      ppe: revenue * 0.4,
      goodwill: null,
      intangibleAssets: null,
      totalAssets: revenue * 1.2,
      accountsPayable: revenue * 0.08,
      shortTermDebt: revenue * 0.02,
      longTermDebt: revenue * 0.2,
      totalCurrentLiabilities: revenue * 0.15,
      totalLiabilities: revenue * 0.5,
      stockholdersEquity: revenue * 0.7,
    },
    cashFlow: {
      operatingCashFlow: revenue * 0.25,
      capex: revenue * 0.05,
      investingCashFlow: -(revenue * 0.05),
      financingCashFlow: -(revenue * 0.03),
      freeCashFlow: revenue * 0.2,
      depreciationAmortization: revenue * 0.03,
      stockBasedCompensation: revenue * 0.02,
      changeInWorkingCapital: null,
    },
  };
}

const FULL_PERIODS: FinancialPeriodData[] = [makePeriod(2023, 100_000_000_000), makePeriod(2024, 110_000_000_000), makePeriod(2025, 121_000_000_000)];

function makeValuationMetrics(ticker: string): CompanyValuationMetrics {
  return {
    ticker,
    name: `${ticker} Inc.`,
    sector: 'Technology',
    industry: 'Software',
    exchange: 'NASDAQ',
    price: 90,
    marketCap: 400_000_000_000,
    dilutedSharesOutstanding: 1_000_000_000,
    revenue: 100_000_000_000,
    revenueGrowth: 0.1,
    ebit: 30_000_000_000,
    ebitda: 33_000_000_000,
    netIncome: 20_000_000_000,
    cash: 30_000_000_000,
    totalDebt: 22_000_000_000,
    bookValue: 70_000_000_000,
    fiscalYear: 2025,
    filingType: '10-K',
    filingDate: '2026-02-01',
    financialsAsOf: '2026-02-01',
    stale: false,
  };
}

function makePeerCandidate(ticker: string): PeerCandidate {
  return {
    metrics: makeValuationMetrics(ticker),
    score: {
      industryScore: 1,
      revenueScore: 0.9,
      marketCapScore: 0.9,
      growthScore: 0.8,
      marginScore: 0.8,
      totalScore: 88,
      computed: { industry: true, revenue: true, marketCap: true, growth: true, margin: true },
    },
  };
}

vi.mock('@/lib/services/companyService', () => ({
  getCompanyOverview: vi.fn(),
}));
vi.mock('@/lib/services/financialDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/financialDataService')>();
  return { ...actual, getFinancials: vi.fn() };
});
vi.mock('@/lib/services/compsDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/compsDataService')>();
  return { ...actual, getPeerCandidates: vi.fn(), fetchTargetAndPeers: vi.fn() };
});
vi.mock('@/lib/services/secFilingService', () => ({
  listFilings: vi.fn(),
  getExistingAnalysis: vi.fn(),
}));
vi.mock('@/lib/services/earningsCallService', () => ({
  listEarningsCalls: vi.fn(),
  getExistingAnalysis: vi.fn(),
  getGuidanceObservations: vi.fn(),
}));

async function importMocks() {
  const companyService = await import('@/lib/services/companyService');
  const financialDataService = await import('@/lib/services/financialDataService');
  const compsDataService = await import('@/lib/services/compsDataService');
  const secFilingService = await import('@/lib/services/secFilingService');
  const earningsCallService = await import('@/lib/services/earningsCallService');
  return { companyService, financialDataService, compsDataService, secFilingService, earningsCallService };
}

describe('aggregateResearchContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('assembles a full context with all five sources registered in assembly order', async () => {
    const { companyService, financialDataService, compsDataService, secFilingService, earningsCallService } = await importMocks();

    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(makeOverview());
    vi.mocked(financialDataService.getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: FULL_PERIODS,
      stale: false,
      dataAsOf: '2026-02-01',
    });
    vi.mocked(compsDataService.getPeerCandidates).mockResolvedValue([makePeerCandidate('PEER1'), makePeerCandidate('PEER2')]);
    vi.mocked(compsDataService.fetchTargetAndPeers).mockResolvedValue({
      target: makeValuationMetrics('ACME'),
      peers: [makeValuationMetrics('PEER1'), makeValuationMetrics('PEER2')],
      failedTickers: [],
    });
    vi.mocked(secFilingService.listFilings).mockResolvedValue([
      { id: 'filing-1', formType: '10-K', filingDate: new Date('2026-02-01'), periodEnd: new Date('2025-12-31') } as never,
    ]);
    vi.mocked(secFilingService.getExistingAnalysis).mockResolvedValue({
      status: 'SUCCESS',
      summary: 'Filing summary.',
      keyChanges: [{ description: 'Revenue grew.' }],
      risks: [{ description: 'Supply chain risk.', category: 'operational' }],
      managementCommentary: [{ description: 'Management commentary.' }],
      capitalAllocation: [{ description: 'Buybacks continued.' }],
      accountingChanges: [],
    } as never);
    vi.mocked(earningsCallService.listEarningsCalls).mockResolvedValue([
      { id: 'call-1', fiscalYear: 2025, fiscalQuarter: 4, callDate: new Date('2026-01-28') } as never,
    ]);
    vi.mocked(earningsCallService.getExistingAnalysis).mockResolvedValue({
      status: 'SUCCESS',
      summary: 'Call summary.',
      businessTrends: [{ description: 'Demand accelerating.', category: 'demand' }],
      risks: [{ description: 'Macro risk.', category: 'macroeconomic' }],
      capitalAllocation: [{ description: 'CapEx increased.', category: 'capex' }],
      managementLanguage: [{ dimension: 'confidence', level: 'high', observation: 'Confident tone.' }],
    } as never);
    vi.mocked(earningsCallService.getGuidanceObservations).mockResolvedValue([
      { metricLabel: 'Full Year Revenue', period: 'FY2026', low: 130, high: 135, midpoint: 132.5, change: 'INCREASED' } as never,
    ]);

    const { aggregateResearchContext } = await import('./aggregateResearchContext');
    const context = await aggregateResearchContext('acme');

    expect(context.ticker).toBe('ACME');
    expect(context.financialPerformance.metrics).toHaveLength(7);
    expect(context.dcfAnalysis?.scenarios.map((s) => s.label)).toEqual(['Bear', 'Base', 'Bull']);
    expect(context.compsAnalysis?.peers).toHaveLength(2);
    expect(context.secFilingContext?.analysis?.summary).toBe('Filing summary.');
    expect(context.earningsContext?.analysis?.summary).toBe('Call summary.');
    expect(context.earningsContext?.guidance).toHaveLength(1);

    expect(context.sources.map((s) => s.type)).toEqual([
      'FINANCIAL_STATEMENT',
      'DCF_MODEL',
      'COMPS_MODEL',
      'SEC_FILING',
      'EARNINGS_CALL',
    ]);
    expect(context.sources.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
    expect(context.warnings).toEqual([]);
  });

  it('never invents data when financials, comps, SEC, and earnings are all unavailable', async () => {
    const { companyService, financialDataService, compsDataService, secFilingService, earningsCallService } = await importMocks();

    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(makeOverview());
    vi.mocked(financialDataService.getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: [], // deliberately incomplete
      stale: false,
      dataAsOf: null,
    });
    vi.mocked(compsDataService.getPeerCandidates).mockResolvedValue([]);
    vi.mocked(secFilingService.listFilings).mockResolvedValue([]);
    vi.mocked(earningsCallService.listEarningsCalls).mockResolvedValue([]);

    const { aggregateResearchContext } = await import('./aggregateResearchContext');
    const context = await aggregateResearchContext('ACME');

    // Every metric series exists (structure is never omitted) but every
    // value is null — nothing is fabricated to fill the gap.
    expect(context.financialPerformance.metrics).toHaveLength(7);
    for (const metric of context.financialPerformance.metrics) {
      expect(metric.values).toEqual([]);
      expect(metric.latestYoyChange).toBeNull();
    }

    expect(context.dcfAnalysis).toBeNull();
    expect(context.compsAnalysis).toBeNull();
    expect(context.secFilingContext).toBeNull();
    expect(context.earningsContext).toBeNull();

    // Only the always-present financial-statement source is registered —
    // no dangling/uncited source for the sections that produced nothing.
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.type).toBe('FINANCIAL_STATEMENT');

    expect(context.warnings.length).toBeGreaterThan(0);
    expect(context.warnings.some((w) => w.toLowerCase().includes('dcf'))).toBe(true);
    expect(context.warnings.some((w) => w.toLowerCase().includes('comparable'))).toBe(true);
    expect(context.warnings.some((w) => w.toLowerCase().includes('sec filing'))).toBe(true);
    expect(context.warnings.some((w) => w.toLowerCase().includes('earnings call'))).toBe(true);
  });

  it('throws ResearchCompanyNotFoundError when the company overview does not exist', async () => {
    const { companyService } = await importMocks();
    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(null);

    const { aggregateResearchContext, ResearchCompanyNotFoundError } = await import('./aggregateResearchContext');
    await expect(aggregateResearchContext('NOPE')).rejects.toBeInstanceOf(ResearchCompanyNotFoundError);
  });

  it('rewraps a CompanyNotFoundError from financialDataService as ResearchCompanyNotFoundError', async () => {
    const { companyService, financialDataService } = await importMocks();
    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(makeOverview());
    vi.mocked(financialDataService.getFinancials).mockRejectedValue(new financialDataService.CompanyNotFoundError('no filer'));

    const { aggregateResearchContext, ResearchCompanyNotFoundError } = await import('./aggregateResearchContext');
    await expect(aggregateResearchContext('ACME')).rejects.toBeInstanceOf(ResearchCompanyNotFoundError);
  });

  it('surfaces a filing with no existing AI analysis as analysis: null, with a warning — never a fabricated summary', async () => {
    const { companyService, financialDataService, compsDataService, secFilingService, earningsCallService } = await importMocks();

    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(makeOverview());
    vi.mocked(financialDataService.getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: FULL_PERIODS,
      stale: false,
      dataAsOf: '2026-02-01',
    });
    vi.mocked(compsDataService.getPeerCandidates).mockResolvedValue([]);
    vi.mocked(secFilingService.listFilings).mockResolvedValue([
      { id: 'filing-1', formType: '10-K', filingDate: new Date('2026-02-01'), periodEnd: new Date('2025-12-31') } as never,
    ]);
    vi.mocked(secFilingService.getExistingAnalysis).mockResolvedValue(null);
    vi.mocked(earningsCallService.listEarningsCalls).mockResolvedValue([]);

    const { aggregateResearchContext } = await import('./aggregateResearchContext');
    const context = await aggregateResearchContext('ACME');

    expect(context.secFilingContext?.filing.id).toBe('filing-1');
    expect(context.secFilingContext?.analysis).toBeNull();
    expect(context.warnings.some((w) => w.includes('has not yet had an AI analysis'))).toBe(true);
    expect(vi.mocked(secFilingService.getExistingAnalysis)).toHaveBeenCalledWith('filing-1');
  });

  it('never registers a COMPS_MODEL source when no peers are available', async () => {
    const { companyService, financialDataService, compsDataService, secFilingService, earningsCallService } = await importMocks();

    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(makeOverview());
    vi.mocked(financialDataService.getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: FULL_PERIODS,
      stale: false,
      dataAsOf: '2026-02-01',
    });
    vi.mocked(compsDataService.getPeerCandidates).mockResolvedValue([]);
    vi.mocked(secFilingService.listFilings).mockResolvedValue([]);
    vi.mocked(earningsCallService.listEarningsCalls).mockResolvedValue([]);

    const { aggregateResearchContext } = await import('./aggregateResearchContext');
    const context = await aggregateResearchContext('ACME');

    expect(context.compsAnalysis).toBeNull();
    expect(context.sources.some((s) => s.type === 'COMPS_MODEL')).toBe(false);
  });
});
