import { getLatestReport } from '@/lib/services/researchReportService';
import { listFilings } from '@/lib/services/secFilingService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { getFinancials, CompanyNotFoundError } from '@/lib/services/financialDataService';

/**
 * "Is my research on this company still current?" — read-only, reuses
 * Milestones 7/8/9's own list/read accessors unchanged, never triggers a
 * new AI generation or a new filing/transcript fetch as a side effect of
 * checking status. DCF and comps have no "last updated" timestamp of their
 * own because Milestone 9 deliberately never persists either (both are
 * recomputed fresh on every view) — `financialDataAsOf` is the honest
 * substitute: it tells you how fresh the INPUT data those live
 * recalculations are built from is, not when a calculation last "ran."
 */

export const DEFAULT_STALE_RESEARCH_DAYS = 45;

export interface ResearchStatus {
  ticker: string;
  latestReport: { id: string; version: number; createdAt: Date; status: string } | null;
  latestFiling: { id: string; formType: string; filingDate: Date } | null;
  latestEarningsCall: { id: string; fiscalYear: number; fiscalQuarter: number; callDate: Date | null } | null;
  /** When the financial statements feeding every live DCF/comps
   * recalculation were last synced — the closest honest proxy for
   * "DCF/comps last updated" given neither is ever stored. */
  financialDataAsOf: string | null;
  /** Days since the latest research report was generated — null if no
   * report has ever been generated for this company. */
  researchAgeDays: number | null;
  isStale: boolean;
}

export async function getResearchStatus(rawTicker: string, staleResearchDays = DEFAULT_STALE_RESEARCH_DAYS): Promise<ResearchStatus> {
  const ticker = rawTicker.trim().toUpperCase();

  const [latestReport, filings, calls, financialDataAsOf] = await Promise.all([
    getLatestReport(ticker),
    listFilings(ticker).catch(() => []),
    listEarningsCalls(ticker).catch(() => []),
    getFinancials(ticker, 'annual')
      .then((f) => f.dataAsOf)
      .catch((error) => {
        if (error instanceof CompanyNotFoundError) return null;
        return null;
      }),
  ]);

  const latestFiling = filings[0] ?? null;
  const latestCall = calls[0] ?? null;

  const researchAgeDays = latestReport ? Math.floor((Date.now() - latestReport.createdAt.getTime()) / (24 * 60 * 60 * 1000)) : null;
  const isStale = researchAgeDays === null || researchAgeDays > staleResearchDays;

  return {
    ticker,
    latestReport: latestReport ? { id: latestReport.id, version: latestReport.version, createdAt: latestReport.createdAt, status: latestReport.status } : null,
    latestFiling: latestFiling ? { id: latestFiling.id, formType: latestFiling.formType, filingDate: latestFiling.filingDate } : null,
    latestEarningsCall: latestCall ? { id: latestCall.id, fiscalYear: latestCall.fiscalYear, fiscalQuarter: latestCall.fiscalQuarter, callDate: latestCall.callDate } : null,
    financialDataAsOf,
    researchAgeDays,
    isStale,
  };
}
