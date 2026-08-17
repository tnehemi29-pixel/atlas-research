import type {
  AnalystTopicItem,
  BusinessTrendItem,
  CapitalAllocationItem,
  CrossSourceItem,
  EarningsCitation,
  EarningsCitedItem,
  EarningsRiskItem,
  GuidanceObservationItem,
  LanguageChangeItem,
  ManagementLanguageItem,
  ToneComparisonItem,
} from '@/lib/ai/earningsSchema';
import type { EarningsFinancialMetric } from '@/lib/earnings/financialResults';
import type { QaExchange } from '@/lib/earnings/qaSeparation';
import type { TranscriptSearchResult } from '@/lib/earnings/search';
import { ApiError } from './companies';

/**
 * Client-side fetch functions for the Earnings Call Intelligence API.
 * Mirrors lib/api/filings.ts conventions exactly. Response types here mirror
 * the Prisma rows returned by the API routes, but with Date fields as
 * strings (their shape after a JSON round trip) — every JSON column is typed
 * against the exact same schema types lib/ai/earningsSchema.ts defines and
 * validates server-side, so the client and the AI response validator can
 * never silently drift apart.
 */

export interface EarningsCallListItem {
  id: string;
  companyId: string;
  fiscalYear: number;
  fiscalQuarter: number;
  periodEndDate: string | null;
  callDate: string | null;
  provider: string;
  providerTranscriptId: string | null;
  processingStatus: string;
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegmentResponse {
  id: string;
  section: string;
  orderIndex: number;
  speakerName: string | null;
  speakerRole: string | null;
  speakerType: string;
  text: string;
  anchor: string;
}

export interface EarningsFinancialResultsResponse {
  periodFound: boolean;
  metrics: EarningsFinancialMetric[];
}

export interface EarningsCallDetailResponse {
  call: EarningsCallListItem;
  segments: TranscriptSegmentResponse[];
  financialResults: EarningsFinancialResultsResponse;
}

export interface EarningsAnalysisResponse {
  id: string;
  earningsCallId: string;
  status: 'SUCCESS' | 'FAILED';
  model: string;
  error: string | null;
  summary: string;
  businessTrends: BusinessTrendItem[];
  managementCommentary: EarningsCitedItem[];
  risks: EarningsRiskItem[];
  capitalAllocation: CapitalAllocationItem[];
  analystTopics: AnalystTopicItem[];
  managementLanguage: ManagementLanguageItem[];
  inputTokens: number | null;
  outputTokens: number | null;
  generatedAt: string;
  updatedAt: string;
}

export interface GuidanceObservationResponse {
  id: string;
  earningsCallId: string;
  metric: string;
  metricLabel: string;
  period: string;
  low: number | null;
  high: number | null;
  midpoint: number | null;
  priorLow: number | null;
  priorHigh: number | null;
  priorMidpoint: number | null;
  change: 'INCREASED' | 'DECREASED' | 'MAINTAINED' | 'NEW';
  sourceExcerpt: string;
  sourceAnchor: string | null;
  createdAt: string;
}

export interface QaResponse {
  exchanges: QaExchange[];
  analystTopics: AnalystTopicItem[] | null;
  topicCounts: Array<{ topic: string; count: number }>;
}

export interface EarningsComparisonResponse {
  id: string;
  earningsCallId: string;
  previousEarningsCallId: string;
  status: 'SUCCESS' | 'FAILED';
  model: string;
  error: string | null;
  financialChanges: EarningsFinancialMetric[];
  languageChanges: LanguageChangeItem[];
  toneComparison: ToneComparisonItem[];
  guidanceSummary: Array<{
    metric: string;
    metricLabel: string;
    period: string;
    midpoint: number | null;
    priorMidpoint: number | null;
    change: string;
  }>;
  generatedAt: string;
}

export interface EarningsFilingComparisonResponse {
  id: string;
  earningsCallId: string;
  secFilingId: string;
  status: 'SUCCESS' | 'FAILED';
  model: string;
  error: string | null;
  alignments: CrossSourceItem[];
  newInCall: CrossSourceItem[];
  onlyInFiling: CrossSourceItem[];
  riskEmphasisDifferences: CrossSourceItem[];
  guidanceDifferences: CrossSourceItem[];
  generatedAt: string;
}

export type { EarningsCitation };

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchEarningsCallList(ticker: string, signal?: AbortSignal): Promise<EarningsCallListItem[]> {
  const response = await fetch(`/api/v1/companies/${encodeURIComponent(ticker)}/earnings`, { signal });
  return parseOrThrow<EarningsCallListItem[]>(response, 'Failed to load earnings calls.');
}

export async function fetchEarningsCallDetail(
  earningsCallId: string,
  signal?: AbortSignal,
): Promise<EarningsCallDetailResponse> {
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}`, { signal });
  return parseOrThrow<EarningsCallDetailResponse>(response, 'Failed to load the earnings call.');
}

export async function fetchEarningsAnalysis(
  earningsCallId: string,
  signal?: AbortSignal,
): Promise<EarningsAnalysisResponse | null> {
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}/analysis`, { signal });
  if (response.status === 404) return null;
  return parseOrThrow<EarningsAnalysisResponse>(response, 'Failed to load the earnings call analysis.');
}

export async function generateEarningsAnalysis(earningsCallId: string, regenerate = false): Promise<EarningsAnalysisResponse> {
  const qs = regenerate ? '?regenerate=true' : '';
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}/analysis${qs}`, { method: 'POST' });
  return parseOrThrow<EarningsAnalysisResponse>(response, 'Failed to generate the earnings call analysis.');
}

export async function fetchGuidanceObservations(
  earningsCallId: string,
  signal?: AbortSignal,
): Promise<GuidanceObservationResponse[]> {
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}/guidance`, { signal });
  return parseOrThrow<GuidanceObservationResponse[]>(response, 'Failed to load guidance.');
}

export async function fetchEarningsQa(earningsCallId: string, signal?: AbortSignal): Promise<QaResponse> {
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}/qa`, { signal });
  return parseOrThrow<QaResponse>(response, 'Failed to load analyst Q&A.');
}

export async function fetchEarningsComparison(
  earningsCallId: string,
  withCallId?: string,
  signal?: AbortSignal,
): Promise<EarningsComparisonResponse | null> {
  const qs = withCallId ? `?with=${encodeURIComponent(withCallId)}` : '';
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}/compare${qs}`, { signal });
  if (response.status === 404) return null;
  return parseOrThrow<EarningsComparisonResponse>(response, 'Failed to load the quarter-over-quarter comparison.');
}

export async function generateEarningsComparison(
  earningsCallId: string,
  withCallId?: string,
  regenerate = false,
): Promise<EarningsComparisonResponse> {
  const params = new URLSearchParams();
  if (withCallId) params.set('with', withCallId);
  if (regenerate) params.set('regenerate', 'true');
  const qs = params.toString();
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}/compare${qs ? `?${qs}` : ''}`, {
    method: 'POST',
  });
  return parseOrThrow<EarningsComparisonResponse>(response, 'Failed to generate the quarter-over-quarter comparison.');
}

export async function fetchEarningsFilingComparison(
  earningsCallId: string,
  filingId?: string,
  signal?: AbortSignal,
): Promise<EarningsFilingComparisonResponse | null> {
  const qs = filingId ? `?filingId=${encodeURIComponent(filingId)}` : '';
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}/compare-filing${qs}`, { signal });
  if (response.status === 404) return null;
  return parseOrThrow<EarningsFilingComparisonResponse>(response, 'Failed to load the SEC filing comparison.');
}

export async function generateEarningsFilingComparison(
  earningsCallId: string,
  filingId?: string,
  regenerate = false,
): Promise<EarningsFilingComparisonResponse> {
  const params = new URLSearchParams();
  if (filingId) params.set('filingId', filingId);
  if (regenerate) params.set('regenerate', 'true');
  const qs = params.toString();
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}/compare-filing${qs ? `?${qs}` : ''}`, {
    method: 'POST',
  });
  return parseOrThrow<EarningsFilingComparisonResponse>(response, 'Failed to generate the SEC filing comparison.');
}

export async function searchEarningsCall(
  earningsCallId: string,
  query: string,
  signal?: AbortSignal,
): Promise<TranscriptSearchResult[]> {
  const response = await fetch(`/api/v1/earnings/${encodeURIComponent(earningsCallId)}/search?q=${encodeURIComponent(query)}`, {
    signal,
  });
  return parseOrThrow<TranscriptSearchResult[]>(response, 'Search failed.');
}
