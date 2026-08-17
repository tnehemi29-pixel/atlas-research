import { z } from 'zod';

/**
 * Financial Modeling Prep adapter — the only file in the app that knows FMP's
 * URL shapes and response quirks. Everything else (companyService, routes,
 * components) talks in terms of packages/types, so swapping or adding a
 * fallback provider later touches this file, not its callers.
 */

// FMP retired the legacy /api/v3 endpoints for new API keys (Aug 31, 2025) —
// /stable is the current API surface; see each function below for the
// corresponding shape/field-name differences from the old v3 responses.
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const REQUEST_TIMEOUT_MS = 6000;

export class ProviderNotConfiguredError extends Error {
  constructor(message = 'FMP_API_KEY is not configured') {
    super(message);
    this.name = 'ProviderNotConfiguredError';
  }
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

function getApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new ProviderNotConfiguredError();
  return key;
}

async function fetchFmp<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${FMP_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('apikey', apiKey);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (cause) {
    const isTimeout = cause instanceof Error && cause.name === 'TimeoutError';
    throw new ProviderRequestError(
      isTimeout ? 'FMP request timed out' : 'FMP request failed to send',
    );
  }

  if (!response.ok) {
    throw new ProviderRequestError(`FMP responded with ${response.status}`, response.status);
  }

  const body = (await response.json()) as unknown;

  // FMP returns HTTP 200 with an { "Error Message": "..." } body for bad
  // API keys and a few other failure modes — treat that as a request error too.
  if (body && typeof body === 'object' && 'Error Message' in body) {
    throw new ProviderRequestError(String((body as { 'Error Message': unknown })['Error Message']));
  }

  return body as T;
}

/** Coerces a value that may arrive as a number, a plain numeric string, or a
 * formatted string like "(+1.23%)" into a finite number, or null. */
function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parses FMP's "124.17-199.62" 52-week range string into [low, high]. */
function parseYearRange(range: unknown): { low: number | null; high: number | null } {
  if (typeof range !== 'string') return { low: null, high: null };

  const match = range.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  const [, low, high] = match ?? [];
  if (!low || !high) return { low: null, high: null };

  return { low: Number.parseFloat(low), high: Number.parseFloat(high) };
}

const searchResultSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  exchange: z.string().nullable().optional(),
});

export interface FmpSearchResult {
  ticker: string;
  name: string;
  exchange: string | null;
}

export async function searchCompaniesFmp(query: string, limit: number): Promise<FmpSearchResult[]> {
  const raw = await fetchFmp<unknown[]>('/search-symbol', { query, limit: String(limit) });

  return raw
    .map((item) => searchResultSchema.safeParse(item))
    .filter((result) => result.success)
    .map(({ data }) => ({
      ticker: data.symbol,
      name: data.name,
      exchange: data.exchange ?? null,
    }));
}

export interface FmpProfile {
  ticker: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  logoUrl: string | null;
  price: number | null;
  changePercent: number | null;
  marketCap: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  beta: number | null;
}

const peerEntrySchema = z.object({
  symbol: z.string(),
});

/**
 * FMP's stock-peers endpoint — an optional, additional source of peer
 * *candidate tickers* for the comps engine (Milestone 6). Never a source of
 * financial data itself: every candidate this returns still goes through
 * the same companyService/financialDataService pipeline as any other
 * ticker, so a peer's multiples are always Atlas's own actual data, never
 * something FMP's peers endpoint reported directly. Returns an empty array
 * (not a fabricated list) whenever FMP has nothing for this ticker.
 */
export async function getPeerTickersFmp(ticker: string): Promise<string[]> {
  const raw = await fetchFmp<unknown[]>('/stock-peers', { symbol: ticker });
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => peerEntrySchema.safeParse(item))
    .filter((result) => result.success)
    .map(({ data }) => data.symbol.toUpperCase());
}

export interface FmpHistoricalPriceBar {
  date: string; // YYYY-MM-DD
  close: number;
  adjClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
}

const historicalPriceBarSchema = z.object({
  date: z.string(),
  close: z.number(),
  adjClose: z.number().nullable().optional(),
  open: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
});

/**
 * Daily end-of-day price bars for one ticker over [from, to] (inclusive,
 * `YYYY-MM-DD`) — Milestone 12's only new FMP call. `adjClose` is passed
 * through when FMP's response includes it and left null otherwise (never
 * computed/estimated here); a row missing even `close` is dropped rather
 * than kept with a fabricated value, matching every other FMP parser in
 * this file. Ordering is whatever FMP returns — callers sort themselves.
 */
export async function getHistoricalPricesFmp(ticker: string, from: string, to: string): Promise<FmpHistoricalPriceBar[]> {
  const raw = await fetchFmp<unknown>('/historical-price-eod/full', { symbol: ticker, from, to });
  const rows = Array.isArray(raw) ? raw : ((raw as { historical?: unknown[] })?.historical ?? []);
  if (!Array.isArray(rows)) return [];

  return rows
    .map((item) => historicalPriceBarSchema.safeParse(item))
    .filter((result) => result.success)
    .map(({ data }) => ({
      date: data.date,
      close: data.close,
      adjClose: data.adjClose ?? null,
      open: data.open ?? null,
      high: data.high ?? null,
      low: data.low ?? null,
      volume: data.volume ?? null,
    }));
}

export async function getCompanyProfileFmp(ticker: string): Promise<FmpProfile | null> {
  const raw = await fetchFmp<unknown[]>('/profile', { symbol: ticker });

  if (!Array.isArray(raw) || raw.length === 0) return null;
  const item = raw[0] as Record<string, unknown>;

  const { low: yearLow, high: yearHigh } = parseYearRange(item.range);

  return {
    ticker: String(item.symbol ?? ticker).toUpperCase(),
    name: typeof item.companyName === 'string' ? item.companyName : ticker,
    exchange: typeof item.exchange === 'string' ? item.exchange : null,
    sector: typeof item.sector === 'string' && item.sector.length > 0 ? item.sector : null,
    industry: typeof item.industry === 'string' && item.industry.length > 0 ? item.industry : null,
    country: typeof item.country === 'string' && item.country.length > 0 ? item.country : null,
    logoUrl: typeof item.image === 'string' && item.image.length > 0 ? item.image : null,
    price: coerceNumber(item.price),
    changePercent: coerceNumber(item.changePercentage),
    marketCap: coerceNumber(item.marketCap),
    yearHigh,
    yearLow,
    beta: coerceNumber(item.beta),
  };
}

/**
 * Earnings-call transcripts (Milestone 8) — isolated in this file exactly
 * like every other FMP endpoint, so a second/alternate transcript provider
 * can be added later without touching lib/earnings/ or lib/services/
 * earningsCallService.ts. FMP gates transcript access behind a paid plan
 * tier; a 402/403 response is a normal, expected outcome here (not a bug),
 * and callers distinguish it via ProviderRequestError.status rather than
 * this file inventing a "transcript unavailable" value of its own — that
 * decision (UNAVAILABLE vs FAILED processing status) belongs to
 * earningsCallService, matching how AI provider errors are only classified
 * one layer up in lib/ai/.
 */

export interface FmpTranscriptDate {
  fiscalYear: number;
  quarter: number;
  date: string | null;
}

const transcriptDateSchema = z.object({
  fiscalYear: z.union([z.number(), z.string()]).optional(),
  year: z.union([z.number(), z.string()]).optional(),
  quarter: z.union([z.number(), z.string()]).optional(),
  period: z.union([z.number(), z.string()]).optional(),
  date: z.string().optional(),
});

function parseQuarter(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.match(/[1-4]/);
  return match ? Number.parseInt(match[0], 10) : null;
}

/** Lists the (fiscalYear, quarter) pairs FMP has a transcript for — used to
 * drive the call feed without fetching every transcript's full text. Returns
 * an empty array (never fabricated) if the endpoint is unavailable on the
 * current plan or the company has no transcripts on file. */
export async function getEarningsCallTranscriptDatesFmp(ticker: string): Promise<FmpTranscriptDate[]> {
  const raw = await fetchFmp<unknown[]>('/earning-call-transcript-dates', { symbol: ticker });
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => transcriptDateSchema.safeParse(item))
    .filter((result) => result.success)
    .map(({ data }) => ({
      fiscalYear: Number(data.fiscalYear ?? data.year ?? NaN),
      quarter: parseQuarter(data.quarter ?? data.period) ?? 0,
      date: data.date ?? null,
    }))
    .filter((entry) => Number.isInteger(entry.fiscalYear) && entry.quarter >= 1 && entry.quarter <= 4);
}

export interface FmpTranscript {
  ticker: string;
  fiscalYear: number;
  quarter: number;
  callDate: string | null;
  content: string;
}

const transcriptSchema = z.object({
  symbol: z.string().optional(),
  fiscalYear: z.union([z.number(), z.string()]).optional(),
  year: z.union([z.number(), z.string()]).optional(),
  quarter: z.union([z.number(), z.string()]).optional(),
  period: z.union([z.number(), z.string()]).optional(),
  date: z.string().optional(),
  content: z.string().optional(),
});

/** Fetches one call's full transcript text. Returns null (never a fabricated
 * transcript) when FMP has nothing for this exact quarter — a normal outcome
 * for a company that didn't hold a call, or a period FMP hasn't indexed. */
export async function getEarningsCallTranscriptFmp(
  ticker: string,
  fiscalYear: number,
  quarter: number,
): Promise<FmpTranscript | null> {
  const raw = await fetchFmp<unknown[]>('/earning-call-transcript', {
    symbol: ticker,
    year: String(fiscalYear),
    quarter: String(quarter),
  });
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const parsed = transcriptSchema.safeParse(raw[0]);
  if (!parsed.success) return null;
  const { data } = parsed;
  if (!data.content || data.content.trim().length === 0) return null;

  return {
    ticker: (data.symbol ?? ticker).toUpperCase(),
    fiscalYear: Number(data.fiscalYear ?? data.year ?? fiscalYear),
    quarter: parseQuarter(data.quarter ?? data.period) ?? quarter,
    callDate: data.date ?? null,
    content: data.content,
  };
}
