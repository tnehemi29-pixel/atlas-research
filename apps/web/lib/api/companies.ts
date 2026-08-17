import type { CompanySearchResult } from '@erp/types';

/**
 * Client-side fetch functions for the companies API. Kept separate from any
 * component so the fetch/error-shape logic isn't duplicated across every
 * place that needs search results.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchCompanySearch(
  query: string,
  signal?: AbortSignal,
): Promise<CompanySearchResult[]> {
  const url = `/api/v1/companies/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? 'Search failed.', response.status);
  }

  return (await response.json()) as CompanySearchResult[];
}
