import { ApiError } from './companies';

/**
 * Client-side fetchers for saving/clearing a company's manual cost-of-debt
 * assumption (lib/services/valuationOverrideService.ts,
 * app/api/v1/companies/[ticker]/valuation/cost-of-debt/route.ts).
 */

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

export async function saveCostOfDebtOverride(ticker: string, costOfDebtOverride: number): Promise<number> {
  const response = await fetch(`/api/v1/companies/${encodeURIComponent(ticker)}/valuation/cost-of-debt`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ costOfDebtOverride }),
  });
  const result = await parseOrThrow<{ costOfDebtOverride: number }>(response, 'Failed to save the cost-of-debt assumption.');
  return result.costOfDebtOverride;
}

export async function clearCostOfDebtOverride(ticker: string): Promise<void> {
  const response = await fetch(`/api/v1/companies/${encodeURIComponent(ticker)}/valuation/cost-of-debt`, {
    method: 'DELETE',
  });
  await parseOrThrow<{ costOfDebtOverride: null }>(response, 'Failed to clear the saved cost-of-debt assumption.');
}
