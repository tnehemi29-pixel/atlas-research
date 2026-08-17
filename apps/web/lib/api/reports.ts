import type { ResearchReportAiPayload } from '@/lib/ai/reportSchema';
import type { ResearchContext } from '@/lib/research/types';
import { ApiError } from './companies';

/**
 * Client-side fetch functions for the Research Report Generator API.
 * Mirrors lib/api/earnings.ts/filings.ts conventions exactly — `content` is
 * typed against the exact same ResearchContext/ResearchReportAiPayload types
 * the backend builds and validates, so the client can never silently drift
 * from what the server actually stores.
 */

export interface ResearchReportContentResponse {
  context: ResearchContext;
  report: ResearchReportAiPayload | null;
}

export interface ResearchReportResponse {
  id: string;
  companyId: string;
  version: number;
  status: 'SUCCESS' | 'FAILED';
  model: string;
  error: string | null;
  dataSnapshotAt: string;
  content: ResearchReportContentResponse;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
  updatedAt: string;
}

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchReportList(ticker: string, signal?: AbortSignal): Promise<ResearchReportResponse[]> {
  const response = await fetch(`/api/v1/companies/${encodeURIComponent(ticker)}/reports`, { signal });
  return parseOrThrow<ResearchReportResponse[]>(response, 'Failed to load research reports.');
}

/** Aggregates the current research data and generates a NEW report version
 * — never overwrites a prior one. */
export async function generateReport(ticker: string): Promise<ResearchReportResponse> {
  const response = await fetch(`/api/v1/companies/${encodeURIComponent(ticker)}/reports`, { method: 'POST' });
  return parseOrThrow<ResearchReportResponse>(response, 'Failed to generate the research report.');
}

export async function fetchReport(reportId: string, signal?: AbortSignal): Promise<ResearchReportResponse> {
  const response = await fetch(`/api/v1/reports/${encodeURIComponent(reportId)}`, { signal });
  return parseOrThrow<ResearchReportResponse>(response, 'Failed to load the research report.');
}
