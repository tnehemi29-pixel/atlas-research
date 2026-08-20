import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getLatestDataQualityChecks, runDataQualityChecks } from './dataQualityService';

const TICKER = 'ZZDQS1';

async function cleanup() {
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) await db.dataQualityCheck.deleteMany({ where: { companyId: company.id } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

async function makeCompany(overrides: { price?: number | null; marketCap?: number | null; quoteUpdatedAt?: Date | null } = {}) {
  return db.company.create({
    data: {
      ticker: TICKER,
      name: 'Data Quality Test Co.',
      price: overrides.price ?? 100,
      marketCap: overrides.marketCap ?? 1_000_000_000,
      quoteUpdatedAt: overrides.quoteUpdatedAt === undefined ? new Date() : overrides.quoteUpdatedAt,
    },
  });
}

async function makePeriod(
  companyId: string,
  fiscalYear: number,
  overrides: { revenue?: number | null; totalAssets?: number | null; cashAndEquivalents?: number | null; filingDate?: Date } = {},
) {
  const revenue = overrides.revenue ?? 500_000_000;
  return db.financialPeriod.create({
    data: {
      companyId,
      fiscalYear,
      fiscalPeriod: 'FY',
      periodType: 'ANNUAL',
      periodEnd: new Date(`${fiscalYear}-12-31`),
      // Default kept as a fixed calendar date (not "now"-relative) because
      // the market-cap-reconciliation test below deliberately coordinates
      // its own quoteUpdatedAt to sit close to this exact value — changing
      // the default here would silently break that test's own freshness
      // window instead. Tests that need a genuinely CURRENT filing (see
      // 'runs freshness, completeness...' below) pass their own filingDate.
      filingDate: overrides.filingDate ?? new Date(`${fiscalYear + 1}-02-01`),
      incomeStatement: {
        create: {
          revenue,
          costOfRevenue: revenue * 0.4,
          grossProfit: revenue * 0.6,
          operatingExpenses: revenue * 0.2,
          operatingIncome: revenue * 0.4,
          dilutedSharesOutstanding: 10_000_000,
        },
      },
      balanceSheet: {
        create: {
          totalAssets: overrides.totalAssets ?? 800_000_000,
          totalLiabilities: 300_000_000,
          stockholdersEquity: 500_000_000,
          shortTermDebt: 20_000_000,
          longTermDebt: 80_000_000,
          cashAndEquivalents: overrides.cashAndEquivalents ?? 150_000_000,
        },
      },
      cashFlowStatement: {
        create: {
          operatingCashFlow: 200_000_000,
          capex: 50_000_000,
          investingCashFlow: -50_000_000,
          financingCashFlow: -30_000_000,
          freeCashFlow: 150_000_000,
        },
      },
    },
  });
}

describe('dataQualityService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('runs freshness, completeness, and reconciliation checks and persists them', async () => {
    const company = await makeCompany();
    // filingDate 60 days before "now": comfortably inside FINANCIAL_STATEMENTS'
    // 100-day CURRENT window (a hardcoded calendar date drifts into AGING/STALE
    // as real time passes — this doesn't), while still beyond
    // MARKET_CAP_STALENESS_THRESHOLD_DAYS (45) from quoteUpdatedAt's default
    // "now", so the market-cap-omission behavior documented just below is
    // unaffected by this fix.
    await makePeriod(company.id, 2025, { filingDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) });

    const outcomes = await runDataQualityChecks(company.id);
    expect(outcomes.length).toBeGreaterThan(0);

    // SEC filing / earnings freshness are legitimately UNKNOWN (never
    // "passed") since this fixture has no SecFiling/EarningsCall rows.
    // Market cap reconciliation is omitted entirely for this fixture (its
    // default quoteUpdatedAt is "now", well beyond MARKET_CAP_STALENESS_
    // THRESHOLD_DAYS from makePeriod's filingDate — correctly `checkable:
    // false`, so it's absent from `outcomes` rather than present-and-passed;
    // see dataQualityService.test.ts's market-cap test for that check's own
    // coverage). Everything else (market data freshness, financial-statement
    // freshness/completeness/reconciliation) should pass for well-formed,
    // internally-consistent fixture data.
    const checkable = outcomes.filter((o) => !(o.dimension === 'FRESHNESS' && o.freshnessStatus === 'UNKNOWN'));
    expect(checkable.length).toBeGreaterThan(0);
    expect(checkable.every((o) => o.passed)).toBe(true);

    const persisted = await db.dataQualityCheck.findMany({ where: { companyId: company.id } });
    expect(persisted.length).toBe(outcomes.length);
  });

  it('flags a balance-sheet reconciliation failure when assets do not equal liabilities + equity', async () => {
    const company = await makeCompany();
    await makePeriod(company.id, 2025, { totalAssets: 999_000_000 }); // should be 300M + 500M = 800M

    const outcomes = await runDataQualityChecks(company.id);
    const balanceSheetCheck = outcomes.find((o) => o.detail.includes('Balance sheet'));
    expect(balanceSheetCheck?.passed).toBe(false);
  });

  it('flags market cap reconciliation failure when marketCap does not equal price x shares', async () => {
    // quoteUpdatedAt close to the period's filingDate (2026-02-01, from
    // makePeriod below) so this test exercises the numeric-mismatch check,
    // not the separate freshness-staleness guard (marketDataValidation.test.ts
    // covers that directly).
    const company = await makeCompany({ price: 100, marketCap: 5_000_000_000, quoteUpdatedAt: new Date('2026-02-10') }); // should be ~1B
    await makePeriod(company.id, 2025);

    const outcomes = await runDataQualityChecks(company.id);
    const marketCapCheck = outcomes.find((o) => o.detail.includes('Market cap'));
    expect(marketCapCheck?.passed).toBe(false);
  });

  it('reports data unavailable for completeness when no financial period exists', async () => {
    const company = await makeCompany();
    const outcomes = await runDataQualityChecks(company.id);
    const completenessCheck = outcomes.find((o) => o.dimension === 'COMPLETENESS');
    expect(completenessCheck?.passed).toBe(false);
    expect(completenessCheck?.detail).toMatch(/Data unavailable/);
  });

  it('classifies market data freshness as UNKNOWN when there is no quote timestamp', async () => {
    const company = await makeCompany({ quoteUpdatedAt: null });
    await makePeriod(company.id, 2025);
    const outcomes = await runDataQualityChecks(company.id);
    const marketFreshness = outcomes.find((o) => o.datasetType === 'MARKET_DATA' && o.dimension === 'FRESHNESS');
    expect(marketFreshness?.freshnessStatus).toBe('UNKNOWN');
  });

  it('getLatestDataQualityChecks returns only the most recent result per distinct check', async () => {
    const company = await makeCompany();
    await makePeriod(company.id, 2025);
    await runDataQualityChecks(company.id);
    await runDataQualityChecks(company.id); // run twice — should not double the "latest" set

    const latest = await getLatestDataQualityChecks(company.id);
    const allRows = await db.dataQualityCheck.findMany({ where: { companyId: company.id } });
    expect(allRows.length).toBe(latest.length * 2);
  });
});
