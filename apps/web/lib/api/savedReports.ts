import { ApiError } from './companies';

export interface SavedReportResponse {
  id: string;
  savedAt: string;
  researchReport: {
    id: string;
    version: number;
    status: 'SUCCESS' | 'FAILED';
    createdAt: string;
    company: { ticker: string; name: string };
  };
}

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

export async function fetchSavedReports(signal?: AbortSignal): Promise<SavedReportResponse[]> {
  const response = await fetch('/api/reports/saved', { signal });
  return parseOrThrow<SavedReportResponse[]>(response, 'Failed to load saved reports.');
}

export async function saveReport(researchReportId: string): Promise<void> {
  const response = await fetch('/api/reports/saved', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ researchReportId }),
  });
  await parseOrThrow<unknown>(response, 'Failed to save report.');
}

export async function unsaveReport(researchReportId: string): Promise<void> {
  const response = await fetch(`/api/reports/saved/${encodeURIComponent(researchReportId)}`, { method: 'DELETE' });
  await parseOrThrow<{ ok: true }>(response, 'Failed to unsave report.');
}
