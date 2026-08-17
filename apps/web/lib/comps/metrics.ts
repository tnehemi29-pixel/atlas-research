import type { CompanyOverview, FinancialPeriodData } from '@erp/types';
import { growthRate, totalDebt as sumTotalDebt } from '@/lib/analytics/ratios';
import type { CompanyValuationMetrics } from './types';

/**
 * The boundary between Atlas Research's existing company/financials data
 * (Milestones 2-4, reused unchanged) and the comps engine's inputs — the
 * comps analogue of lib/valuation/marketData.ts. Nothing here invents a
 * number: every field either passes through an actual retrieved value, sums
 * two actual fields, or is null when the underlying data is unavailable.
 */

/** EBITDA = EBIT + D&A. Always derived — no filer reports it as a single
 * XBRL concept — and never silently substituted with EBIT or operating cash
 * flow when D&A is unavailable. */
export function computeEbitda(ebit: number | null, depreciationAmortization: number | null): number | null {
  if (ebit === null || depreciationAmortization === null) return null;
  return ebit + depreciationAmortization;
}

/**
 * Builds a company's valuation-metrics snapshot from its overview (M2) and
 * latest/prior annual financial periods (M3/M4). `priorPeriod` is only used
 * for the revenue-growth calculation; omit it (or pass null) when only one
 * year of history is available — growth is then null, not 0%.
 */
export function buildValuationMetrics(
  overview: CompanyOverview,
  latestPeriod: FinancialPeriodData | null,
  priorPeriod: FinancialPeriodData | null,
  financialsAsOf: string | null = null,
): CompanyValuationMetrics {
  const revenue = latestPeriod?.incomeStatement.revenue ?? null;
  const ebit = latestPeriod?.incomeStatement.operatingIncome ?? null;
  const da = latestPeriod?.cashFlow.depreciationAmortization ?? null;

  return {
    ticker: overview.ticker,
    name: overview.name,
    sector: overview.sector,
    industry: overview.industry,
    exchange: overview.exchange,

    price: overview.price,
    marketCap: overview.marketCap,
    dilutedSharesOutstanding: latestPeriod?.incomeStatement.dilutedSharesOutstanding ?? null,

    revenue,
    revenueGrowth: growthRate(revenue, priorPeriod?.incomeStatement.revenue ?? null),
    ebit,
    ebitda: computeEbitda(ebit, da),
    netIncome: latestPeriod?.incomeStatement.netIncome ?? null,
    cash: latestPeriod?.balanceSheet.cashAndEquivalents ?? null,
    totalDebt: latestPeriod
      ? sumTotalDebt(latestPeriod.balanceSheet.shortTermDebt, latestPeriod.balanceSheet.longTermDebt)
      : null,
    bookValue: latestPeriod?.balanceSheet.stockholdersEquity ?? null,

    fiscalYear: latestPeriod?.fiscalYear ?? null,
    filingType: latestPeriod?.filingType ?? null,
    filingDate: latestPeriod?.filingDate ?? null,
    financialsAsOf,
    stale: overview.stale,
  };
}
