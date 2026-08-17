import { ApiError } from './companies';

export interface FollowedCompanySourceResponse {
  type: 'watchlist' | 'portfolio';
  label: string;
}

export interface ResearchFeedItemResponse {
  id: string;
  type: 'NEW_SEC_FILING' | 'NEW_EARNINGS_CALL' | 'NEW_RESEARCH_REPORT' | 'RESEARCH_REPORT_UPDATED' | 'VALUATION_CHANGE' | 'GUIDANCE_CHANGE' | 'FILING_RISK';
  ticker: string;
  companyName: string;
  title: string;
  description: string;
  occurredAt: string;
  href: string;
}

export interface EarningsCalendarEntryResponse {
  ticker: string;
  name: string;
  expectedDate: string | null;
  isEstimate: boolean;
  basis: string;
  followedIn: FollowedCompanySourceResponse[];
}

export interface FilingMonitorEntryResponse {
  ticker: string;
  name: string;
  filingId: string;
  formType: string;
  filingDate: string;
  isNew: boolean;
  followedIn: FollowedCompanySourceResponse[];
}

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchEarningsCalendar(signal?: AbortSignal): Promise<EarningsCalendarEntryResponse[]> {
  const response = await fetch('/api/earnings-calendar', { signal });
  return parseOrThrow<EarningsCalendarEntryResponse[]>(response, 'Failed to load the earnings calendar.');
}

export async function fetchFilingMonitor(signal?: AbortSignal): Promise<FilingMonitorEntryResponse[]> {
  const response = await fetch('/api/filing-monitor', { signal });
  return parseOrThrow<FilingMonitorEntryResponse[]>(response, 'Failed to load the filing monitor.');
}
