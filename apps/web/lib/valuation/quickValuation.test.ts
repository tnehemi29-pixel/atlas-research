import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanyOverview, FinancialPeriodData } from '@erp/types';
import type { CompanyValuationMetrics, PeerCandidate } from '@/lib/comps/types';

/**
 * Unit tests for the shared quick-valuation orchestration layer. Every
 * external service call is mocked; the DCF and comps ENGINES themselves run
 * for real (pure functions, no I/O) — same convention as
 * lib/research/aggregateResearchContext.test.ts, which this module mirrors
 * in spirit (a thin reuse layer over the same engines/services).
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
  return { ...actual, getCompanyValuationMetrics: vi.fn(), getPeerCandidates: vi.fn(), fetchTargetAndPeers: vi.fn() };
});

async function importMocks() {
  const companyService = await import('@/lib/services/companyService');
  const financialDataService = await import('@/lib/services/financialDataService');
  const compsDataService = await import('@/lib/services/compsDataService');
  return { companyService, financialDataService, compsDataService };
}

describe('getQuickFundamentals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns fundamentals + multiples for a real ticker', async () => {
    const { financialDataService, compsDataService } = await importMocks();
    vi.mocked(compsDataService.getCompanyValuationMetrics).mockResolvedValue(makeValuationMetrics('ACME'));
    // getFinancials genuinely returns newest-first (orderBy periodEnd desc) —
    // mirror that real ordering here rather than the fixture's declaration order.
    vi.mocked(financialDataService.getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: [...FULL_PERIODS].reverse(),
      stale: false,
      dataAsOf: '2026-02-01',
    });

    const { getQuickFundamentals } = await import('./quickValuation');
    const result = await getQuickFundamentals('acme');

    expect(result?.ticker).toBe('ACME');
    expect(result?.revenueGrowth).toBe(0.1);
    expect(result?.evToEbitda).toBeCloseTo((400_000_000_000 + 22_000_000_000 - 30_000_000_000) / 33_000_000_000);
    expect(result?.freeCashFlow).toBe(121_000_000_000 * 0.2);
  });

  it('returns null for a ticker with no company at all', async () => {
    const { compsDataService } = await importMocks();
    vi.mocked(compsDataService.getCompanyValuationMetrics).mockResolvedValue(null);

    const { getQuickFundamentals } = await import('./quickValuation');
    expect(await getQuickFundamentals('NOPE')).toBeNull();
  });

  it('leaves freeCashFlow null rather than throwing when financials are unavailable', async () => {
    const { financialDataService, compsDataService } = await importMocks();
    vi.mocked(compsDataService.getCompanyValuationMetrics).mockResolvedValue(makeValuationMetrics('ACME'));
    vi.mocked(financialDataService.getFinancials).mockRejectedValue(new Error('SEC unreachable'));

    const { getQuickFundamentals } = await import('./quickValuation');
    const result = await getQuickFundamentals('ACME');

    expect(result).not.toBeNull();
    expect(result?.freeCashFlow).toBeNull();
  });
});

describe('getQuickDcf', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the real DCF engine against fetched historicals', async () => {
    const { companyService, financialDataService } = await importMocks();
    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(makeOverview());
    vi.mocked(financialDataService.getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: FULL_PERIODS,
      stale: false,
      dataAsOf: '2026-02-01',
    });

    const { getQuickDcf } = await import('./quickValuation');
    const result = await getQuickDcf('ACME');

    expect(result).not.toBeNull();
    expect(result?.currentSharePrice).toBe(100);
    expect(typeof result?.isValid).toBe('boolean');
  });

  it('returns null when the company does not exist', async () => {
    const { companyService } = await importMocks();
    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(null);

    const { getQuickDcf } = await import('./quickValuation');
    expect(await getQuickDcf('NOPE')).toBeNull();
  });

  it('returns null when there is no annual financial history', async () => {
    const { companyService, financialDataService } = await importMocks();
    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(makeOverview());
    vi.mocked(financialDataService.getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: [],
      stale: false,
      dataAsOf: null,
    });

    const { getQuickDcf } = await import('./quickValuation');
    expect(await getQuickDcf('ACME')).toBeNull();
  });
});

describe('getQuickDcfScenarios', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the real DCF engine three times (bear/base/bull) with bear <= base <= bull implied value', async () => {
    const { companyService, financialDataService } = await importMocks();
    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(makeOverview());
    vi.mocked(financialDataService.getFinancials).mockResolvedValue({
      ticker: 'ACME',
      periodType: 'annual',
      periods: FULL_PERIODS,
      stale: false,
      dataAsOf: '2026-02-01',
    });

    const { getQuickDcfScenarios } = await import('./quickValuation');
    const result = await getQuickDcfScenarios('ACME');

    expect(result).not.toBeNull();
    expect(result?.bear.label).toBe('Bear');
    expect(result?.base.label).toBe('Base');
    expect(result?.bull.label).toBe('Bull');
    // A more optimistic growth/margin delta should never imply a lower value than a more pessimistic one.
    if (result?.bear.impliedSharePrice !== null && result?.base.impliedSharePrice !== null && result?.bull.impliedSharePrice !== null) {
      expect(result!.bear.impliedSharePrice!).toBeLessThanOrEqual(result!.base.impliedSharePrice!);
      expect(result!.base.impliedSharePrice!).toBeLessThanOrEqual(result!.bull.impliedSharePrice!);
    }
  });

  it('returns null when the company does not exist', async () => {
    const { companyService } = await importMocks();
    vi.mocked(companyService.getCompanyOverview).mockResolvedValue(null);

    const { getQuickDcfScenarios } = await import('./quickValuation');
    expect(await getQuickDcfScenarios('NOPE')).toBeNull();
  });
});

describe('getQuickComps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the real comps engine against an auto-selected peer set', async () => {
    const { compsDataService } = await importMocks();
    vi.mocked(compsDataService.getPeerCandidates).mockResolvedValue([makePeerCandidate('PEER1'), makePeerCandidate('PEER2')]);
    vi.mocked(compsDataService.fetchTargetAndPeers).mockResolvedValue({
      target: makeValuationMetrics('ACME'),
      peers: [makeValuationMetrics('PEER1'), makeValuationMetrics('PEER2')],
      failedTickers: [],
    });

    const { getQuickComps } = await import('./quickValuation');
    const result = await getQuickComps('ACME');

    expect(result).not.toBeNull();
    expect(result?.impliedSharePrice).not.toBeNull();
  });

  it('returns null when no peer candidates can be found', async () => {
    const { compsDataService } = await importMocks();
    vi.mocked(compsDataService.getPeerCandidates).mockResolvedValue([]);

    const { getQuickComps } = await import('./quickValuation');
    expect(await getQuickComps('ACME')).toBeNull();
  });
});
