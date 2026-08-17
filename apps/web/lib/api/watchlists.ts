import { ApiError } from './companies';

export interface WatchlistListItem {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { companies: number };
}

export interface WatchlistRowResponse {
  companyId: string;
  ticker: string;
  name: string;
  orderIndex: number;
  price: number | null;
  marketCap: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  freeCashFlow: number | null;
  evToEbitda: number | null;
  peRatio: number | null;
  dcfImpliedPrice: number | null;
  dcfUpsideDownside: number | null;
}

export interface WatchlistDetailResponse {
  watchlist: { id: string; userId: string; name: string; createdAt: string; updatedAt: string };
  rows: WatchlistRowResponse[];
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

export async function fetchWatchlists(signal?: AbortSignal): Promise<WatchlistListItem[]> {
  const response = await fetch('/api/watchlists', { signal });
  return parseOrThrow<WatchlistListItem[]>(response, 'Failed to load watchlists.');
}

export async function createWatchlist(name: string): Promise<WatchlistListItem> {
  const response = await fetch('/api/watchlists', json('POST', { name }));
  return parseOrThrow<WatchlistListItem>(response, 'Failed to create watchlist.');
}

export async function fetchWatchlistDetail(id: string, signal?: AbortSignal): Promise<WatchlistDetailResponse> {
  const response = await fetch(`/api/watchlists/${encodeURIComponent(id)}`, { signal });
  return parseOrThrow<WatchlistDetailResponse>(response, 'Failed to load watchlist.');
}

export async function renameWatchlist(id: string, name: string): Promise<WatchlistListItem> {
  const response = await fetch(`/api/watchlists/${encodeURIComponent(id)}`, json('PATCH', { name }));
  return parseOrThrow<WatchlistListItem>(response, 'Failed to rename watchlist.');
}

export async function deleteWatchlist(id: string): Promise<void> {
  const response = await fetch(`/api/watchlists/${encodeURIComponent(id)}`, json('DELETE'));
  await parseOrThrow<{ ok: true }>(response, 'Failed to delete watchlist.');
}

export async function addCompanyToWatchlist(id: string, ticker: string): Promise<void> {
  const response = await fetch(`/api/watchlists/${encodeURIComponent(id)}/companies`, json('POST', { ticker }));
  await parseOrThrow<unknown>(response, 'Failed to add company.');
}

export async function removeCompanyFromWatchlist(id: string, ticker: string): Promise<void> {
  const response = await fetch(`/api/watchlists/${encodeURIComponent(id)}/companies/${encodeURIComponent(ticker)}`, json('DELETE'));
  await parseOrThrow<{ ok: true }>(response, 'Failed to remove company.');
}

export async function reorderWatchlistCompanies(id: string, tickers: string[]): Promise<void> {
  const response = await fetch(`/api/watchlists/${encodeURIComponent(id)}/reorder`, json('POST', { tickers }));
  await parseOrThrow<{ ok: true }>(response, 'Failed to reorder watchlist.');
}
