import { Prisma, type DataQualityDimension, type FreshnessStatus, type IntegrityDatasetType } from '@prisma/client';
import { db } from '@/lib/db';
import { classifyDatasetFreshness } from '@/lib/integrity/freshness';
import { runFinancialReconciliation } from '@/lib/integrity/financialReconciliation';
import { checkMarketCapReconciliation } from '@/lib/integrity/marketDataValidation';

/**
 * Milestone 14 spec sections 2-3, 5-8 — the data-quality layer: freshness,
 * completeness, and reconciliation checks run directly against Milestone
 * 1-3's own stored data (Company, FinancialPeriod + statements, SecFiling,
 * EarningsCall). Every check is append-only-persisted as a DataQualityCheck
 * row (spec: never collapse into one unexplained score) — this service
 * never mutates a financial statement, and a missing figure is always
 * reported as "Data unavailable," never filled with an estimate.
 */

export interface DataQualityCheckOutcome {
  datasetType: IntegrityDatasetType;
  dimension: DataQualityDimension;
  passed: boolean;
  freshnessStatus?: FreshnessStatus;
  detail: string;
  metadata?: Record<string, unknown>;
}

function debtOf(balanceSheet: { shortTermDebt: number | null; longTermDebt: number | null } | null): number | null {
  if (!balanceSheet) return null;
  if (balanceSheet.shortTermDebt === null && balanceSheet.longTermDebt === null) return null;
  return (balanceSheet.shortTermDebt ?? 0) + (balanceSheet.longTermDebt ?? 0);
}

async function loadCompanyOrThrow(companyId: string) {
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error(`Company ${companyId} not found.`);
  return company;
}

async function loadRecentAnnualPeriods(companyId: string) {
  return db.financialPeriod.findMany({
    where: { companyId, periodType: 'ANNUAL' },
    orderBy: { fiscalYear: 'desc' },
    take: 2,
    include: { incomeStatement: true, balanceSheet: true, cashFlowStatement: true },
  });
}

/** Stamps a stable `checkName` into an outcome's metadata so
 * getLatestDataQualityChecks can dedupe by "which check is this" rather than
 * by its free-text detail, which legitimately changes every run (the exact
 * numbers move even when the same check keeps being run). */
function withCheckName(outcome: DataQualityCheckOutcome, checkName: string): DataQualityCheckOutcome {
  return { ...outcome, metadata: { ...outcome.metadata, checkName: outcome.metadata?.checkName ?? checkName } };
}

function checkFreshness(datasetType: IntegrityDatasetType, timestamp: Date | null): DataQualityCheckOutcome {
  const freshnessStatus = classifyDatasetFreshness(datasetType, timestamp);
  const passed = freshnessStatus === 'CURRENT' || freshnessStatus === 'AGING';
  return {
    datasetType,
    dimension: 'FRESHNESS',
    passed,
    freshnessStatus,
    detail:
      freshnessStatus === 'UNKNOWN'
        ? `${datasetType}: freshness unknown — no timestamp is recorded.`
        : `${datasetType} is ${freshnessStatus.toLowerCase()} (last known as of ${timestamp?.toISOString() ?? 'unknown'}).`,
  };
}

function checkFinancialStatementCompleteness(period: {
  fiscalYear: number;
  incomeStatement: { revenue: number | null; operatingIncome: number | null; dilutedSharesOutstanding: number | null } | null;
  balanceSheet: { longTermDebt: number | null; shortTermDebt: number | null; cashAndEquivalents: number | null } | null;
  cashFlowStatement: { freeCashFlow: number | null } | null;
} | null): DataQualityCheckOutcome {
  if (!period) {
    return { datasetType: 'FINANCIAL_STATEMENTS', dimension: 'COMPLETENESS', passed: false, detail: 'Data unavailable — no financial period is on record for this company.' };
  }

  const missing: string[] = [];
  if (period.incomeStatement?.revenue === null || period.incomeStatement?.revenue === undefined) missing.push('revenue');
  if (period.incomeStatement?.operatingIncome === null || period.incomeStatement?.operatingIncome === undefined) missing.push('operating income');
  if (period.cashFlowStatement?.freeCashFlow === null || period.cashFlowStatement?.freeCashFlow === undefined) missing.push('free cash flow');
  if (period.incomeStatement?.dilutedSharesOutstanding === null || period.incomeStatement?.dilutedSharesOutstanding === undefined) missing.push('diluted shares outstanding');
  if (debtOf(period.balanceSheet) === null) missing.push('total debt');
  if (period.balanceSheet?.cashAndEquivalents === null || period.balanceSheet?.cashAndEquivalents === undefined) missing.push('cash and equivalents');

  return {
    datasetType: 'FINANCIAL_STATEMENTS',
    dimension: 'COMPLETENESS',
    passed: missing.length === 0,
    detail: missing.length === 0 ? `FY${period.fiscalYear} financial statements are complete.` : `Data unavailable for FY${period.fiscalYear}: ${missing.join(', ')}.`,
    metadata: { fiscalYear: period.fiscalYear, missing },
  };
}

export async function runDataQualityChecks(companyId: string): Promise<DataQualityCheckOutcome[]> {
  const [company, periods, latestFiling, latestEarningsCall] = await Promise.all([
    loadCompanyOrThrow(companyId),
    loadRecentAnnualPeriods(companyId),
    db.secFiling.findFirst({ where: { companyId }, orderBy: { filingDate: 'desc' } }),
    db.earningsCall.findFirst({ where: { companyId }, orderBy: [{ callDate: 'desc' }, { createdAt: 'desc' }] }),
  ]);

  const [latest, prior] = periods;
  const outcomes: DataQualityCheckOutcome[] = [];

  // Freshness (spec section 3).
  outcomes.push(withCheckName(checkFreshness('MARKET_DATA', company.quoteUpdatedAt), 'freshness'));
  outcomes.push(withCheckName(checkFreshness('FINANCIAL_STATEMENTS', latest?.filingDate ?? null), 'freshness'));
  outcomes.push(withCheckName(checkFreshness('SEC_FILINGS', latestFiling?.filingDate ?? null), 'freshness'));
  outcomes.push(withCheckName(checkFreshness('EARNINGS', latestEarningsCall?.callDate ?? latestEarningsCall?.createdAt ?? null), 'freshness'));

  // Completeness (spec section 5).
  outcomes.push(withCheckName(checkFinancialStatementCompleteness(latest ?? null), 'completeness'));

  // Financial-statement reconciliation (spec section 6, calculation integrity).
  if (latest) {
    const reconciliation = runFinancialReconciliation({
      revenue: latest.incomeStatement?.revenue ?? null,
      costOfRevenue: latest.incomeStatement?.costOfRevenue ?? null,
      grossProfit: latest.incomeStatement?.grossProfit ?? null,
      operatingExpenses: latest.incomeStatement?.operatingExpenses ?? null,
      operatingIncome: latest.incomeStatement?.operatingIncome ?? null,
      totalAssets: latest.balanceSheet?.totalAssets ?? null,
      totalLiabilities: latest.balanceSheet?.totalLiabilities ?? null,
      stockholdersEquity: latest.balanceSheet?.stockholdersEquity ?? null,
      operatingCashFlow: latest.cashFlowStatement?.operatingCashFlow ?? null,
      capex: latest.cashFlowStatement?.capex ?? null,
      freeCashFlow: latest.cashFlowStatement?.freeCashFlow ?? null,
      investingCashFlow: latest.cashFlowStatement?.investingCashFlow ?? null,
      financingCashFlow: latest.cashFlowStatement?.financingCashFlow ?? null,
      cashAndEquivalents: latest.balanceSheet?.cashAndEquivalents ?? null,
      priorPeriodCashAndEquivalents: prior?.balanceSheet?.cashAndEquivalents ?? null,
    });
    for (const check of reconciliation) {
      if (!check.checkable) continue; // missing-data is already reflected by the completeness check above
      outcomes.push({
        datasetType: 'FINANCIAL_STATEMENTS',
        dimension: 'CALCULATION_INTEGRITY',
        passed: check.passed,
        detail: check.detail,
        metadata: { checkName: check.check, actual: check.actual, expected: check.expected, differenceAbsolute: check.differenceAbsolute, tolerancePercent: check.tolerancePercent },
      });
    }
  }

  // Market data validation (spec section 8). Market cap is Price × Shares
  // Outstanding — basic shares, not diluted. Diluted shares outstanding is
  // an EPS denominator (it adds back the dilutive effect of options/RSUs on
  // top of the actual outstanding count), so comparing it against a
  // provider's real market cap systematically overstates "expected" by the
  // company's dilution — a real, individually-correct number on both sides,
  // just the wrong one for this comparison. Basic shares outstanding is the
  // actual share count and the correct basis for this check.
  const marketCapCheck = checkMarketCapReconciliation({
    sharePrice: company.price,
    sharesOutstanding: latest?.incomeStatement?.basicSharesOutstanding ?? null,
    marketCap: company.marketCap,
    quoteUpdatedAt: company.quoteUpdatedAt,
    filingDate: latest?.filingDate ?? null,
  });
  if (marketCapCheck.checkable) {
    outcomes.push({
      datasetType: 'MARKET_DATA',
      dimension: 'CALCULATION_INTEGRITY',
      passed: marketCapCheck.passed,
      detail: marketCapCheck.detail,
      metadata: { checkName: marketCapCheck.check, actual: marketCapCheck.actual, expected: marketCapCheck.expected },
    });
  }

  await db.dataQualityCheck.createMany({
    data: outcomes.map((o) => ({
      companyId,
      datasetType: o.datasetType,
      dimension: o.dimension,
      passed: o.passed,
      freshnessStatus: o.freshnessStatus ?? null,
      detail: o.detail,
      metadata: (o.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });

  return outcomes;
}

/** The most recent check for every (datasetType, dimension) pair this
 * company has ever had run — "current state" from an append-only log,
 * matching FinancialDataRefreshLog's own read pattern. */
export async function getLatestDataQualityChecks(companyId: string): Promise<DataQualityCheckOutcome[]> {
  const rows = await db.dataQualityCheck.findMany({ where: { companyId }, orderBy: { checkedAt: 'desc' } });
  const seen = new Set<string>();
  const latest: DataQualityCheckOutcome[] = [];
  for (const row of rows) {
    const metadata = row.metadata as Record<string, unknown> | null;
    const checkName = typeof metadata?.checkName === 'string' ? metadata.checkName : 'default';
    const key = `${row.datasetType}:${row.dimension}:${checkName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push({
      datasetType: row.datasetType,
      dimension: row.dimension,
      passed: row.passed,
      freshnessStatus: row.freshnessStatus ?? undefined,
      detail: row.detail,
      metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    });
  }
  return latest;
}
