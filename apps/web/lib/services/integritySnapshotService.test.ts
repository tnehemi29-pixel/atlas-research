import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
import { getPeerCandidates } from '@/lib/services/compsDataService';
import { computeIntegritySnapshot, getCompanyIntegritySnapshot, getGlobalIntegrityDashboard } from './integritySnapshotService';

const TICKER = 'ZZISS1';

async function cleanup() {
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) {
    await db.auditLogEntry.deleteMany({ where: { companyId: company.id } });
    await db.researchIntegrityIssue.deleteMany({ where: { companyId: company.id } });
    await db.dataQualityCheck.deleteMany({ where: { companyId: company.id } });
    await db.modelAudit.deleteMany({ where: { companyId: company.id } });
    await db.integritySnapshot.deleteMany({ where: { companyId: company.id } });
  }
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('integritySnapshotService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    await cleanup();
    vi.mocked(getCompanyOverview).mockReset();
    vi.mocked(getFinancials).mockReset();
    vi.mocked(getPeerCandidates).mockReset();
  });

  it('computes a snapshot, persists issues, and caches the result', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Snapshot Test Co.', price: 100, marketCap: 5_000_000_000, quoteUpdatedAt: new Date() } });
    await db.financialPeriod.create({
      data: {
        companyId: company.id,
        fiscalYear: 2025,
        fiscalPeriod: 'FY',
        periodType: 'ANNUAL',
        periodEnd: new Date('2025-12-31'),
        filingDate: new Date(),
        incomeStatement: { create: { revenue: 1_000_000_000, costOfRevenue: 400_000_000, grossProfit: 600_000_000, operatingExpenses: 200_000_000, operatingIncome: 400_000_000, dilutedSharesOutstanding: 50_000_000 } },
        balanceSheet: { create: { totalAssets: 900_000_000, totalLiabilities: 999_000_000, stockholdersEquity: 500_000_000, shortTermDebt: 10_000_000, longTermDebt: 40_000_000, cashAndEquivalents: 100_000_000 } }, // corrupted: assets != liab+equity
        cashFlowStatement: { create: { operatingCashFlow: 300_000_000, capex: 50_000_000, freeCashFlow: 250_000_000 } },
      },
    });
    vi.mocked(getCompanyOverview).mockResolvedValue(null); // no DCF possible
    vi.mocked(getPeerCandidates).mockResolvedValue([]); // no comps possible

    const result = await computeIntegritySnapshot(company.id);
    expect(result.status).not.toBe('VERIFIED');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.dimensions.financialStatements.status).toBe('ERROR'); // reconciliation failure

    const issues = await db.researchIntegrityIssue.findMany({ where: { companyId: company.id, category: 'FINANCIAL_RECONCILIATION' } });
    expect(issues.length).toBeGreaterThan(0);

    const snapshot = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.status).toBe(result.status);
  });

  it('getCompanyIntegritySnapshot serves the cached row within the TTL rather than recomputing', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Snapshot Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const first = await getCompanyIntegritySnapshot(company.id);
    const second = await getCompanyIntegritySnapshot(company.id);
    expect(second.computedAt.getTime()).toBe(first.computedAt.getTime());

    const refreshed = await getCompanyIntegritySnapshot(company.id, { forceRefresh: true });
    expect(refreshed.computedAt.getTime()).toBeGreaterThanOrEqual(first.computedAt.getTime());
  });

  it('a fully clean, well-formed company does not generate false CRITICAL findings', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Clean Co.', price: 100, marketCap: 5_000_000_000, quoteUpdatedAt: new Date() } });
    await db.financialPeriod.create({
      data: {
        companyId: company.id,
        fiscalYear: 2025,
        fiscalPeriod: 'FY',
        periodType: 'ANNUAL',
        periodEnd: new Date('2025-12-31'),
        filingDate: new Date(),
        incomeStatement: { create: { revenue: 1_000_000_000, costOfRevenue: 400_000_000, grossProfit: 600_000_000, operatingExpenses: 200_000_000, operatingIncome: 400_000_000, dilutedSharesOutstanding: 50_000_000 } },
        balanceSheet: { create: { totalAssets: 900_000_000, totalLiabilities: 400_000_000, stockholdersEquity: 500_000_000, shortTermDebt: 10_000_000, longTermDebt: 40_000_000, cashAndEquivalents: 100_000_000 } },
        cashFlowStatement: { create: { operatingCashFlow: 300_000_000, capex: 50_000_000, freeCashFlow: 250_000_000 } },
      },
    });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const result = await computeIntegritySnapshot(company.id);
    expect(result.status).not.toBe('CRITICAL');
    expect(result.dimensions.financialStatements.status).toBe('OK');
  });

  it('getGlobalIntegrityDashboard only lists companies with an already-computed snapshot', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Dashboard Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const beforeCompute = await getGlobalIntegrityDashboard();
    expect(beforeCompute.some((r) => r.companyId === company.id)).toBe(false);

    await computeIntegritySnapshot(company.id);
    const afterCompute = await getGlobalIntegrityDashboard();
    expect(afterCompute.some((r) => r.companyId === company.id)).toBe(true);
  });
});
