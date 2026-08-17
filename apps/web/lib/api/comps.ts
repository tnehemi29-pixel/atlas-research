import type { CompanyValuationMetrics, PeerCandidate } from '@/lib/comps/types';
import { ApiError } from './companies';

/**
 * Client-side fetch functions for the comps API. Mirrors lib/api/companies.ts
 * and lib/api/financials.ts — fetch/error-shape logic stays out of
 * components. The UI only ever calls the two *data* endpoints
 * (peer-candidates, comps); it runs lib/comps/engine.ts itself so toggling a
 * peer or excluding an outlier recomputes instantly with no round trip. The
 * /valuation-multiples and /implied-valuation routes exist as standalone,
 * spec-required REST endpoints (and a demonstration that the engine is
 * genuinely isomorphic) but aren't fetched from the UI.
 */

export async function fetchPeerCandidates(ticker: string, signal?: AbortSignal): Promise<PeerCandidate[]> {
  const url = `/api/v1/companies/${encodeURIComponent(ticker)}/peer-candidates`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? 'Failed to load peer candidates.', response.status);
  }

  return (await response.json()) as PeerCandidate[];
}

export interface CompsDataResponse {
  target: CompanyValuationMetrics;
  peers: CompanyValuationMetrics[];
  failedTickers: string[];
}

export async function fetchCompsData(
  ticker: string,
  peerTickers: string[],
  signal?: AbortSignal,
): Promise<CompsDataResponse> {
  const query = peerTickers.length > 0 ? `?peers=${encodeURIComponent(peerTickers.join(','))}` : '';
  const url = `/api/v1/companies/${encodeURIComponent(ticker)}/comps${query}`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? 'Failed to load comps data.', response.status);
  }

  return (await response.json()) as CompsDataResponse;
}
