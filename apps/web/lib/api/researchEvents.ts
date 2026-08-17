import { ApiError } from './companies';

/**
 * Client-side fetchers for Milestone 11's research-event intelligence
 * feed — mirrors the response shapes built by lib/services/
 * researchEventFeedService.ts and lib/services/thesisMonitorService.ts
 * exactly, so the API route handlers stay thin pass-throughs.
 */

export type ResearchEventCategoryValue = 'SEC_FILING' | 'EARNINGS' | 'FINANCIAL' | 'VALUATION' | 'CORPORATE_EVENT';
export type MaterialityLevelValue = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ConfidenceLevelValue = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ResearchFeedEventSummaryResponse {
  id: string;
  ticker: string;
  companyName: string;
  category: ResearchEventCategoryValue;
  type: string;
  title: string;
  description: string;
  materiality: MaterialityLevelValue;
  confidence: ConfidenceLevelValue;
  eventDate: string;
  detectedAt: string;
  isRead: boolean;
  aiSummary: string | null;
}

export interface ResearchFeedResponse {
  items: ResearchFeedEventSummaryResponse[];
  unreadCount: number;
}

export interface ResearchEventSourceResponse {
  type: string;
  label: string;
  detail: string | null;
  href: string;
}

export interface ResearchEventDetailResponse extends ResearchFeedEventSummaryResponse {
  aiStatus: 'SUCCESS' | 'FAILED' | null;
  aiWhyItMatters: string | null;
  aiAffectedResearchAreas: string[] | null;
  aiQuestionsToInvestigate: string[] | null;
  aiConfidence: ConfidenceLevelValue | null;
  aiError: string | null;
  changes: { metric: string; unit: string; previousValue: number | null; currentValue: number | null; changeAbsolute: number | null; changePercent: number | null }[];
  impacts: { area: string; note: string }[];
  sources: ResearchEventSourceResponse[];
}

export interface CompanyTimelineEventResponse {
  id: string;
  category: ResearchEventCategoryValue;
  type: string;
  title: string;
  description: string;
  materiality: MaterialityLevelValue;
  confidence: ConfidenceLevelValue;
  eventDate: string;
}

export interface ThesisMonitorComparisonResponse {
  newValue: number;
  changeAbsolute: number;
  changePercent: number | null;
  flagged: boolean;
  note: string;
  comparedAt: string;
  researchEventId: string | null;
}

export interface ThesisMonitorAssumptionResponse {
  key: string;
  label: string;
  originalValue: number;
  unit: string;
  extractedFrom: string;
  latestComparison: ThesisMonitorComparisonResponse | null;
}

export interface ThesisMonitorResponse {
  reportId: string;
  reportVersion: number;
  assumptions: ThesisMonitorAssumptionResponse[];
}

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

export interface ResearchFeedFilterParams {
  minMateriality?: MaterialityLevelValue;
  category?: ResearchEventCategoryValue;
  unreadOnly?: boolean;
}

export async function fetchResearchFeed(filters: ResearchFeedFilterParams = {}, signal?: AbortSignal): Promise<ResearchFeedResponse> {
  const params = new URLSearchParams();
  if (filters.minMateriality) params.set('minMateriality', filters.minMateriality);
  if (filters.category) params.set('category', filters.category);
  if (filters.unreadOnly) params.set('unreadOnly', 'true');

  const query = params.toString();
  const response = await fetch(`/api/research-feed${query ? `?${query}` : ''}`, { signal });
  return parseOrThrow<ResearchFeedResponse>(response, 'Failed to load the research feed.');
}

export async function fetchResearchEventDetail(eventId: string, signal?: AbortSignal): Promise<ResearchEventDetailResponse> {
  const response = await fetch(`/api/research-feed/${encodeURIComponent(eventId)}`, { signal });
  return parseOrThrow<ResearchEventDetailResponse>(response, 'Failed to load the event.');
}

export async function markResearchEventRead(eventId: string): Promise<void> {
  const response = await fetch(`/api/research-feed/${encodeURIComponent(eventId)}/read`, { method: 'POST' });
  await parseOrThrow<{ ok: true }>(response, 'Failed to mark the event read.');
}

export async function markResearchEventUnread(eventId: string): Promise<void> {
  const response = await fetch(`/api/research-feed/${encodeURIComponent(eventId)}/unread`, { method: 'POST' });
  await parseOrThrow<{ ok: true }>(response, 'Failed to mark the event unread.');
}

export async function markAllResearchEventsRead(): Promise<{ markedCount: number }> {
  const response = await fetch('/api/research-feed/mark-all-read', { method: 'POST' });
  return parseOrThrow<{ markedCount: number }>(response, 'Failed to mark all events read.');
}

export async function fetchCompanyTimeline(ticker: string, category?: ResearchEventCategoryValue, signal?: AbortSignal): Promise<CompanyTimelineEventResponse[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  const response = await fetch(`/api/companies/${encodeURIComponent(ticker)}/timeline${query}`, { signal });
  return parseOrThrow<CompanyTimelineEventResponse[]>(response, 'Failed to load the company timeline.');
}

export async function fetchCompanyRecentChanges(ticker: string, signal?: AbortSignal): Promise<CompanyTimelineEventResponse[]> {
  const response = await fetch(`/api/companies/${encodeURIComponent(ticker)}/changes`, { signal });
  return parseOrThrow<CompanyTimelineEventResponse[]>(response, 'Failed to load recent changes.');
}

export async function fetchThesisMonitor(ticker: string, signal?: AbortSignal): Promise<ThesisMonitorResponse | null> {
  const response = await fetch(`/api/companies/${encodeURIComponent(ticker)}/thesis-monitor`, { signal });
  if (response.status === 404) return null;
  return parseOrThrow<ThesisMonitorResponse>(response, 'Failed to load the thesis monitor.');
}

export interface AssumptionChangeResponse {
  key: string;
  label: string;
  originalValue: number;
  unit: string;
  newValue: number;
  changeAbsolute: number;
  changePercent: number | null;
  flagged: boolean;
  note: string;
  comparedAt: string;
  researchEventId: string | null;
}

export async function fetchAssumptionChanges(ticker: string, signal?: AbortSignal): Promise<AssumptionChangeResponse[]> {
  const response = await fetch(`/api/companies/${encodeURIComponent(ticker)}/assumption-changes`, { signal });
  return parseOrThrow<AssumptionChangeResponse[]>(response, 'Failed to load assumption changes.');
}
