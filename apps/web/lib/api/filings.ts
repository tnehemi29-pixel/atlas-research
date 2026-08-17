import type { Citation, CitedItem, RiskItem } from '@/lib/ai/schema';
import type { FinancialChangeMetric } from '@/lib/sec/financialChanges';
import type { FilingSearchResult } from '@/lib/sec/search';
import { ApiError } from './companies';

/**
 * Client-side fetch functions for the SEC Filing Intelligence API. Mirrors
 * lib/api/comps.ts / financials.ts conventions. Response types here mirror
 * the Prisma rows returned by the API routes, but with Date fields as
 * strings (their shape after a JSON round trip) — every JSON column
 * (risks, keyChanges, etc.) is typed against the exact same schema types
 * lib/ai/schema.ts defines and validates server-side, so the client and the
 * AI response validator can never silently drift apart.
 */

export interface FilingListItem {
  id: string;
  companyId: string;
  filingType: string;
  formType: string;
  filingDate: string;
  periodEnd: string | null;
  accessionNumber: string;
  primaryDocument: string;
  secUrl: string;
  description: string | null;
  items: string | null;
  processingStatus: string;
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
  importance: 'High' | 'Medium' | 'Low';
}

export interface FilingSectionResponse {
  id: string;
  sectionType: string;
  title: string;
  itemCode: string | null;
  anchor: string;
  content: string;
  charCount: number;
}

export interface FilingDetailResponse {
  filing: Omit<FilingListItem, 'importance'>;
  sections: FilingSectionResponse[];
}

export interface FilingAnalysisResponse {
  id: string;
  filingId: string;
  status: 'SUCCESS' | 'FAILED';
  model: string;
  error: string | null;
  summary: string;
  keyChanges: CitedItem[];
  risks: RiskItem[];
  managementCommentary: CitedItem[];
  capitalAllocation: CitedItem[];
  accountingChanges: CitedItem[];
  inputTokens: number | null;
  outputTokens: number | null;
  generatedAt: string;
  updatedAt: string;
}

export interface RemovedRiskItem {
  description: string;
  priorSource: Citation;
}

export interface ChangedLanguageItem {
  description: string;
  note: string;
  currentSource: Citation;
  priorSource: Citation;
}

export interface FilingComparisonResponse {
  id: string;
  filingId: string;
  previousFilingId: string;
  status: 'SUCCESS' | 'FAILED';
  model: string;
  error: string | null;
  financialChanges: FinancialChangeMetric[];
  newRisks: CitedItem[];
  removedRisks: RemovedRiskItem[];
  changedLanguage: ChangedLanguageItem[];
  guidanceChanges: CitedItem[];
  managementCommentaryChanges: CitedItem[];
  generatedAt: string;
}

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

export interface FilingListFilters {
  types?: string[];
  from?: string;
  to?: string;
  materialOnly?: boolean;
}

export async function fetchFilingList(
  ticker: string,
  filters: FilingListFilters = {},
  signal?: AbortSignal,
): Promise<FilingListItem[]> {
  const query = new URLSearchParams();
  if (filters.types && filters.types.length > 0) query.set('type', filters.types.join(','));
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (filters.materialOnly) query.set('material', 'true');

  const qs = query.toString();
  const url = `/api/v1/companies/${encodeURIComponent(ticker)}/filings${qs ? `?${qs}` : ''}`;
  const response = await fetch(url, { signal });
  return parseOrThrow<FilingListItem[]>(response, 'Failed to load SEC filings.');
}

export async function fetchFilingDetail(filingId: string, signal?: AbortSignal): Promise<FilingDetailResponse> {
  const response = await fetch(`/api/v1/filings/${encodeURIComponent(filingId)}`, { signal });
  return parseOrThrow<FilingDetailResponse>(response, 'Failed to load the filing.');
}

export async function fetchFilingAnalysis(filingId: string, signal?: AbortSignal): Promise<FilingAnalysisResponse | null> {
  const response = await fetch(`/api/v1/filings/${encodeURIComponent(filingId)}/analysis`, { signal });
  if (response.status === 404) return null;
  return parseOrThrow<FilingAnalysisResponse>(response, 'Failed to load the filing analysis.');
}

export async function generateFilingAnalysis(filingId: string, regenerate = false): Promise<FilingAnalysisResponse> {
  const qs = regenerate ? '?regenerate=true' : '';
  const response = await fetch(`/api/v1/filings/${encodeURIComponent(filingId)}/analysis${qs}`, { method: 'POST' });
  return parseOrThrow<FilingAnalysisResponse>(response, 'Failed to generate the filing analysis.');
}

export async function fetchFilingComparison(
  filingId: string,
  withFilingId?: string,
  signal?: AbortSignal,
): Promise<FilingComparisonResponse | null> {
  const qs = withFilingId ? `?with=${encodeURIComponent(withFilingId)}` : '';
  const response = await fetch(`/api/v1/filings/${encodeURIComponent(filingId)}/compare${qs}`, { signal });
  if (response.status === 404) return null;
  return parseOrThrow<FilingComparisonResponse>(response, 'Failed to load the filing comparison.');
}

export async function generateFilingComparison(
  filingId: string,
  withFilingId?: string,
  regenerate = false,
): Promise<FilingComparisonResponse> {
  const params = new URLSearchParams();
  if (withFilingId) params.set('with', withFilingId);
  if (regenerate) params.set('regenerate', 'true');
  const qs = params.toString();
  const response = await fetch(`/api/v1/filings/${encodeURIComponent(filingId)}/compare${qs ? `?${qs}` : ''}`, {
    method: 'POST',
  });
  return parseOrThrow<FilingComparisonResponse>(response, 'Failed to generate the filing comparison.');
}

export async function searchFiling(filingId: string, query: string, signal?: AbortSignal): Promise<FilingSearchResult[]> {
  const response = await fetch(`/api/v1/filings/${encodeURIComponent(filingId)}/search?q=${encodeURIComponent(query)}`, {
    signal,
  });
  return parseOrThrow<FilingSearchResult[]>(response, 'Search failed.');
}
