import { ApiError } from './companies';

export type AlertType =
  | 'NEW_SEC_FILING'
  | 'EARNINGS_AVAILABLE'
  | 'DCF_VALUATION_CHANGE'
  | 'RESEARCH_REPORT_UPDATED'
  | 'GUIDANCE_CHANGED'
  | 'HIGH_IMPORTANCE_RESEARCH_EVENT'
  | 'CRITICAL_RESEARCH_EVENT'
  | 'NEW_MATERIAL_RISK'
  | 'CRITICAL_INTEGRITY_ISSUE'
  | 'RESEARCH_DATA_MISMATCH'
  | 'DCF_MODEL_ERROR'
  | 'THESIS_ASSUMPTION_CONFLICT';

export interface AlertResponse {
  id: string;
  userId: string;
  type: AlertType;
  companyId: string | null;
  company: { ticker: string; name: string } | null;
  thresholdPercent: number | null;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastTriggeredAt: string | null;
  lastTriggeredSummary: string | null;
  createdAt: string;
}

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

function json(method: string, body?: unknown): RequestInit {
  return { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined };
}

export async function fetchAlerts(signal?: AbortSignal): Promise<AlertResponse[]> {
  const response = await fetch('/api/alerts', { signal });
  return parseOrThrow<AlertResponse[]>(response, 'Failed to load alerts.');
}

export async function createAlert(input: { type: AlertType; ticker?: string | null; thresholdPercent?: number | null }): Promise<AlertResponse> {
  const response = await fetch('/api/alerts', json('POST', input));
  return parseOrThrow<AlertResponse>(response, 'Failed to create alert.');
}

export async function setAlertActive(id: string, isActive: boolean): Promise<AlertResponse> {
  const response = await fetch(`/api/alerts/${encodeURIComponent(id)}`, json('PATCH', { isActive }));
  return parseOrThrow<AlertResponse>(response, 'Failed to update alert.');
}

export async function deleteAlert(id: string): Promise<void> {
  const response = await fetch(`/api/alerts/${encodeURIComponent(id)}`, json('DELETE'));
  await parseOrThrow<{ ok: true }>(response, 'Failed to delete alert.');
}
