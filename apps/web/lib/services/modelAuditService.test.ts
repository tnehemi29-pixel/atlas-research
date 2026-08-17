import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FinancialPeriodData } from '@erp/types';

vi.mock('@/lib/services/companyService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/companyService')>();
  return { ...actual, getCompanyOverview: vi.fn() };
});
vi.mock('@/lib/services/financialDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/financialDataService')>();
  return { ...actual, getFinancials: vi.fn() };
});
vi.mock('@/lib/services/compsDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/compsDataService')>();
  return { ...actual, getPeerCandidates: vi.fn(), fetchTargetAndPeers: vi.fn() };
});

import { db } from '@/lib/db';
import { getCompanyOverview } from '@/lib/services/companyService';
import { getFinancials } from '@/lib/services/financialDataService';
import { getPeerCandidates, fetchTargetAndPeers } from '@/lib/services/compsDataService';
import type { CompanyValuationMetrics } from '@/lib/comps/types';
import { getLatestModelAudit, runCompsModelAudit, runDcfModelAudit } from './modelAuditService';

const TICKER = 'ZZMAS1';

async function cleanup() {
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) await db.modelAudit.deleteMany({ where: { companyId: company.id } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

function makePeriod(fiscalYear: number, revenue: number, filingDate: string): FinancialPeriodData {
  return {
    fiscalYear,
    fiscalPeriod: 'FY',
    periodType: 'annual',
    periodStart: `${fiscalYear - 1}-01-01`,
    periodEnd: `${fiscalYear}-12-31`,
    filingType: '10-K',
    filingDate,
    incomeStatement: {
      revenue, costOfRevenue: revenue * 0.4, grossProfit: revenue * 0.6, operatingExpenses: revenue * 0.4, operatingIncome: revenue * 0.2,
      interestExpense: revenue * 0.005, pretaxIncome: revenue * 0.195, incomeTax: revenue * 0.05, netIncome: revenue * 0.145,
      eps: null, dilutedEps: null, basicSharesOutstanding: null, dilutedSharesOutstanding: 100_000_000,
    },
    balanceSheet: {
      cashAndEquivalents: revenue * 0.15, shortTermInvestments: null, accountsReceivable: null, inventory: null, totalCurrentAssets: null,
      ppe: null, goodwill: null, intangibleAssets: null, totalAssets: null, accountsPayable: null,
      shortTermDebt: revenue * 0.02, longTermDebt: revenue * 0.08, totalCurrentLiabilities: null, totalLiabilities: null, stockholdersEquity: null,
    },
    cashFlow: {
      operatingCashFlow: revenue * 0.22, capex: revenue * 0.06, investingCashFlow: null, financingCashFlow: null, freeCashFlow: revenue * 0.16,
      depreciationAmortization: revenue * 0.05, stockBasedCompensation: null, changeInWorkingCapital: null,
    },
  };
}

function makeMetrics(ticker: string, overrides: Partial<CompanyValuationMetrics> = {}): CompanyValuationMetrics {
  return {
    ticker, name: `${ticker} Inc.`, sector: 'Tech', industry: 'Software', exchange: 'NASDAQ',
    price: 50, marketCap: 5_000_000_000, dilutedSharesOutstanding: 100_000_000,
    revenue: 2_000_000_000, revenueGrowth: 0.1, ebit: 400_000_000, ebitda: 500_000_000, netIncome: 300_000_000,
    cash: 300_000_000, totalDebt: 200_000_000, bookValue: 1_500_000_000,
    fiscalYear: 2025, filingType: '10-K', filingDate: '2026-02-01', financialsAsOf: '2026-02-01', stale: false,
    ...overrides,
  };
}

describe('modelAuditService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    await cleanup();
    vi.mocked(getCompanyOverview).mockReset();
    vi.mocked(getFinancials).mockReset();
    vi.mocked(getPeerCandidates).mockReset();
    vi.mocked(fetchTargetAndPeers).mockReset();
  });

  describe('runDcfModelAudit', () => {
    it('runs a real DCF via the existing engine and persists a ModelAudit row', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Model Audit Test Co.' } });
      vi.mocked(getCompanyOverview).mockResolvedValue({
        ticker: TICKER, name: 'Model Audit Test Co.', exchange: 'NASDAQ', sector: 'Tech', industry: 'Software', country: 'US', logoUrl: null,
        price: 50, changePercent: 0, marketCap: 5_000_000_000, yearHigh: 60, yearLow: 40, beta: 1.1, quoteUpdatedAt: new Date().toISOString(), stale: false,
      });
      vi.mocked(getFinancials).mockResolvedValue({
        ticker: TICKER, periodType: 'annual', stale: false,
        periods: [makePeriod(2023, 1_800_000_000, '2024-02-01'), makePeriod(2024, 2_000_000_000, '2025-02-01'), makePeriod(2025, 2_200_000_000, '2026-02-01')],
      } as never);

      const outcome = await runDcfModelAudit(company.id);
      expect(outcome).not.toBeNull();
      expect(outcome!.modelType).toBe('DCF_MODEL');
      expect(outcome!.findings.length).toBeGreaterThan(0);

      const persisted = await getLatestModelAudit(company.id, 'DCF_MODEL');
      expect(persisted).not.toBeNull();
      expect(persisted!.passed).toBe(outcome!.passed);
    });

    it('returns null when there is no company overview', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'No Overview Co.' } });
      vi.mocked(getCompanyOverview).mockResolvedValue(null);
      const outcome = await runDcfModelAudit(company.id);
      expect(outcome).toBeNull();
    });

    it('returns null when there are no financial periods', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'No Financials Co.' } });
      vi.mocked(getCompanyOverview).mockResolvedValue({
        ticker: TICKER, name: 'No Financials Co.', exchange: null, sector: null, industry: null, country: null, logoUrl: null,
        price: 50, changePercent: 0, marketCap: 5_000_000_000, yearHigh: null, yearLow: null, beta: null, quoteUpdatedAt: null, stale: false,
      });
      vi.mocked(getFinancials).mockResolvedValue({ ticker: TICKER, periodType: 'annual', stale: false, periods: [] } as never);
      const outcome = await runDcfModelAudit(company.id);
      expect(outcome).toBeNull();
    });

    it('returns null for a nonexistent company id', async () => {
      const outcome = await runDcfModelAudit('nonexistent-id');
      expect(outcome).toBeNull();
    });
  });

  describe('runCompsModelAudit', () => {
    it('runs a real comps analysis and persists a ModelAudit row', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Comps Audit Test Co.' } });
      vi.mocked(getPeerCandidates).mockResolvedValue([
        { metrics: makeMetrics('PEERA'), score: { industryScore: 1, revenueScore: 1, marketCapScore: 1, growthScore: 1, marginScore: 1, totalScore: 90, computed: { industry: true, revenue: true, marketCap: true, growth: true, margin: true } } },
        { metrics: makeMetrics('PEERB'), score: { industryScore: 1, revenueScore: 1, marketCapScore: 1, growthScore: 1, marginScore: 1, totalScore: 85, computed: { industry: true, revenue: true, marketCap: true, growth: true, margin: true } } },
        { metrics: makeMetrics('PEERC'), score: { industryScore: 1, revenueScore: 1, marketCapScore: 1, growthScore: 1, marginScore: 1, totalScore: 80, computed: { industry: true, revenue: true, marketCap: true, growth: true, margin: true } } },
      ]);
      vi.mocked(fetchTargetAndPeers).mockResolvedValue({
        target: makeMetrics(TICKER),
        peers: [makeMetrics('PEERA'), makeMetrics('PEERB'), makeMetrics('PEERC')],
        failedTickers: [],
      });

      const outcome = await runCompsModelAudit(company.id);
      expect(outcome).not.toBeNull();
      expect(outcome!.modelType).toBe('COMPS_MODEL');

      const persisted = await getLatestModelAudit(company.id, 'COMPS_MODEL');
      expect(persisted).not.toBeNull();
    });

    it('returns null when no peer candidates can be found', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'No Peers Co.' } });
      vi.mocked(getPeerCandidates).mockResolvedValue([]);
      const outcome = await runCompsModelAudit(company.id);
      expect(outcome).toBeNull();
    });
  });
});
