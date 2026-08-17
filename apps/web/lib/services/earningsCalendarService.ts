import { getFollowedCompanies } from '@/lib/services/followedCompaniesService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import type { FollowedCompanySource } from '@/lib/services/followedCompaniesService';

/**
 * Atlas has no live forward-looking earnings-calendar data source
 * integrated (Milestone 8's FMP integration only covers past transcripts) —
 * "Do not invent earnings dates" and "if the source is uncertain, clearly
 * identify that" rule out presenting a specific guessed date as if it were
 * confirmed. Instead, every entry is deterministically derived from the
 * company's own last known call date plus a standard ~quarterly cadence,
 * and is ALWAYS labeled `isEstimate: true` with an explicit basis string —
 * never rendered as a confirmed date anywhere downstream.
 */

const ESTIMATED_QUARTER_DAYS = 91;

export interface EarningsCalendarEntry {
  ticker: string;
  name: string;
  expectedDate: string | null;
  isEstimate: boolean;
  basis: string;
  followedIn: FollowedCompanySource[];
}

/** The per-company estimation building block — factored out so Milestone
 * 15's workspace calendar (lib/services/researchCalendarService.ts) can
 * reuse the exact same "never invent a confirmed date" logic for a
 * workspace's covered companies instead of the calling user's own followed
 * list, without a second estimation implementation. */
export async function estimateEarningsCalendarEntry(ticker: string, name: string, followedIn: FollowedCompanySource[]): Promise<EarningsCalendarEntry> {
  const calls = await listEarningsCalls(ticker).catch(() => []);
  const latest = calls[0] ?? null;

  if (!latest?.callDate) {
    return { ticker, name, expectedDate: null, isEstimate: false, basis: 'No prior earnings-call date on record for this company.', followedIn };
  }

  const estimated = new Date(latest.callDate.getTime() + ESTIMATED_QUARTER_DAYS * 24 * 60 * 60 * 1000);
  return {
    ticker,
    name,
    expectedDate: estimated.toISOString(),
    isEstimate: true,
    basis: `Estimated ~${ESTIMATED_QUARTER_DAYS} days after the last call (Q${latest.fiscalQuarter} ${latest.fiscalYear}, ${latest.callDate.toISOString().slice(0, 10)}) — not a confirmed date.`,
    followedIn,
  };
}

export async function getEarningsCalendar(userId: string): Promise<EarningsCalendarEntry[]> {
  const companies = await getFollowedCompanies(userId);
  const entries = await Promise.all(companies.map((company) => estimateEarningsCalendarEntry(company.ticker, company.name, company.sources)));
  return entries.sort((a, b) => (a.expectedDate ?? '9999-99-99').localeCompare(b.expectedDate ?? '9999-99-99'));
}
