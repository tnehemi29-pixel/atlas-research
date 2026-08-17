import { getFollowedCompanies } from '@/lib/services/followedCompaniesService';
import { listFilings } from '@/lib/services/secFilingService';
import type { FollowedCompanySource } from '@/lib/services/followedCompaniesService';

/** A filing newer than this counts as "New Filing" in the monitor UI. */
const NEW_FILING_WINDOW_DAYS = 14;
const MAX_FILINGS_PER_COMPANY = 5;

export interface FilingMonitorEntry {
  ticker: string;
  name: string;
  filingId: string;
  formType: string;
  filingDate: string;
  isNew: boolean;
  followedIn: FollowedCompanySource[];
}

/** Recent SEC filings across every company the user follows — reuses
 * Milestone 7's listFilings() unchanged (including its own sync-if-stale
 * behavior); never re-implements filing retrieval or processing. */
export async function getFilingMonitor(userId: string): Promise<FilingMonitorEntry[]> {
  const companies = await getFollowedCompanies(userId);
  const now = Date.now();

  const perCompany = await Promise.all(
    companies.map(async (company) => {
      const filings = await listFilings(company.ticker).catch(() => []);
      return filings.slice(0, MAX_FILINGS_PER_COMPANY).map(
        (filing): FilingMonitorEntry => ({
          ticker: company.ticker,
          name: company.name,
          filingId: filing.id,
          formType: filing.formType,
          filingDate: filing.filingDate.toISOString(),
          isNew: now - filing.filingDate.getTime() < NEW_FILING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
          followedIn: company.sources,
        }),
      );
    }),
  );

  return perCompany.flat().sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}
