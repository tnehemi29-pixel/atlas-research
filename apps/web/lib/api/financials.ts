import type { CompanyFinancialsResponse, PeriodType } from '@erp/types';
import { ApiError } from './companies';

/**
 * Client-side fetch for the financials API. Mirrors lib/api/companies.ts —
 * fetch logic stays out of components, and each period type is its own
 * request so the client only ever asks for the view currently selected
 * (see FinancialsWorkspace's query key: ['financials', ticker, periodType]).
 */
export async function fetchCompanyFinancials(
  ticker: string,
  periodType: PeriodType,
  signal?: AbortSignal,
): Promise<CompanyFinancialsResponse> {
  const url = `/api/v1/companies/${encodeURIComponent(ticker)}/financials?period=${periodType}`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? 'Failed to load financial data.', response.status);
  }

  return (await response.json()) as CompanyFinancialsResponse;
}
