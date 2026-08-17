import { TtlCache } from '@/lib/cache/ttlCache';

/**
 * SEC EDGAR adapter — the only file that knows SEC's URL shapes, header
 * requirements, and XBRL company-facts JSON structure. Everything downstream
 * (lib/xbrl/*) works with the raw shapes exported here; nothing outside this
 * file constructs a sec.gov URL.
 *
 * SEC requires every request to carry an identifying User-Agent (name +
 * contact email) — see https://www.sec.gov/os/webmaster-faq#developers.
 * Unidentified/generic User-Agents get rate-limited or blocked outright, so
 * SEC_USER_AGENT must be set to something real in production; the fallback
 * below is only for local development where SEC's abuse-desk enforcement is
 * unlikely to matter, and should not be relied on.
 */

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const COMPANY_FACTS_URL = (cik10: string) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
const SUBMISSIONS_URL = (cik10: string) => `https://data.sec.gov/submissions/CIK${cik10}.json`;

const REQUEST_TIMEOUT_MS = 10_000;
const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000;

export class SecNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecNotFoundError';
  }
}

export class SecRateLimitError extends Error {
  constructor(message = 'SEC EDGAR rate limit exceeded') {
    super(message);
    this.name = 'SecRateLimitError';
  }
}

export class SecRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'SecRequestError';
  }
}

function userAgent(): string {
  return (
    process.env.SEC_USER_AGENT || 'Atlas Research (dev-fallback, set SEC_USER_AGENT) dev@localhost'
  );
}

/** Shared request/retry/error-mapping logic — returns the raw Response so
 * callers can choose `.json()` (fetchSec) or `.text()` (getFilingDocument)
 * without duplicating the 404/429/timeout handling. */
async function fetchSecRaw(url: string, accept: string, attempt = 1): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': userAgent(), Accept: accept },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const isTimeout = cause instanceof Error && cause.name === 'TimeoutError';
    throw new SecRequestError(
      isTimeout ? 'SEC EDGAR request timed out' : 'SEC EDGAR request failed to send',
    );
  }

  if (response.status === 404) {
    throw new SecNotFoundError(`SEC EDGAR has no record at ${url}`);
  }

  if (response.status === 429) {
    // SEC asks clients to back off; one short retry, then surface a clear error.
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      return fetchSecRaw(url, accept, attempt + 1);
    }
    throw new SecRateLimitError();
  }

  if (!response.ok) {
    throw new SecRequestError(`SEC EDGAR responded with ${response.status}`, response.status);
  }

  return response;
}

async function fetchSec<T>(url: string): Promise<T> {
  const response = await fetchSecRaw(url, 'application/json');
  return (await response.json()) as T;
}

/** Fetches a filing document (or any other non-JSON SEC page) as raw text —
 * used for the primary document HTML of a filing, which lib/sec/* then
 * parses. Filing documents can be several MB for a large 10-K; this returns
 * the full text and leaves any size-based truncation to the caller, which
 * has the context (which section it needs) to truncate meaningfully. */
export async function getFilingDocument(url: string): Promise<string> {
  const response = await fetchSecRaw(url, 'text/html,application/xhtml+xml,text/plain');
  return response.text();
}

interface TickerMapEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

const tickerMapCache = new TtlCache<Map<string, TickerMapEntry>>(TICKER_MAP_TTL_MS);
const TICKER_MAP_CACHE_KEY = 'sec-ticker-map';

async function getTickerMap(): Promise<Map<string, TickerMapEntry>> {
  const cached = tickerMapCache.get(TICKER_MAP_CACHE_KEY);
  if (cached) return cached;

  const raw = await fetchSec<Record<string, TickerMapEntry>>(TICKERS_URL);
  const map = new Map<string, TickerMapEntry>();
  for (const entry of Object.values(raw)) {
    map.set(entry.ticker.toUpperCase(), entry);
  }

  tickerMapCache.set(TICKER_MAP_CACHE_KEY, map);
  return map;
}

export interface SecCompanyIdentity {
  cik: string;
  name: string;
}

/** Resolves a ticker to its 10-digit zero-padded CIK via SEC's ticker map. */
export async function resolveCik(ticker: string): Promise<SecCompanyIdentity | null> {
  const map = await getTickerMap();
  const entry = map.get(ticker.trim().toUpperCase());
  if (!entry) return null;

  return { cik: String(entry.cik_str).padStart(10, '0'), name: entry.title };
}

export interface SecXbrlFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
  frame?: string;
}

export interface SecXbrlConcept {
  label?: string;
  description?: string;
  units: Record<string, SecXbrlFact[]>;
}

export interface SecCompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap'?: Record<string, SecXbrlConcept>;
    // dei (Document and Entity Information) and any other taxonomy a filer
    // uses (e.g. ifrs-full for foreign private issuers) may also be present;
    // Atlas Research's concept map only reads us-gaap for now — see
    // lib/xbrl/conceptMap.ts.
    [taxonomy: string]: Record<string, SecXbrlConcept> | undefined;
  };
}

/** Fetches the full XBRL company-facts payload for a 10-digit zero-padded CIK. */
export async function getCompanyFacts(cik10: string): Promise<SecCompanyFacts> {
  return fetchSec<SecCompanyFacts>(COMPANY_FACTS_URL(cik10));
}

// ---------------------------------------------------------------------------
// Filing list (Milestone 7 — SEC Filing Intelligence)
// ---------------------------------------------------------------------------

/** One entry from SEC's submissions API — already reshaped from SEC's
 * columnar (parallel-array) JSON into a plain per-filing record. */
export interface SecFilingListEntry {
  accessionNumber: string; // with dashes, as SEC provides it: "0000320193-24-000123"
  form: string; // raw form label, e.g. "10-K", "10-K/A", "8-K", "DEF 14A", "20-F"
  filingDate: string; // "2024-11-01"
  reportDate: string | null; // period of report — empty string in SEC's data becomes null
  items: string | null; // comma-separated 8-K item codes, e.g. "2.02,9.01" — null for non-8-Ks
  primaryDocument: string;
  primaryDocDescription: string | null;
  size: number | null;
  isXBRL: boolean;
}

export interface SecSubmissions {
  cik: string;
  name: string;
  filings: SecFilingListEntry[];
}

interface RawRecentFilings {
  accessionNumber: string[];
  form: string[];
  filingDate: string[];
  reportDate: string[];
  items: string[];
  primaryDocument: string[];
  primaryDocDescription?: string[];
  size?: number[];
  isXBRL?: number[];
}

interface RawSubmissionsResponse {
  cik: string;
  name: string;
  filings: {
    recent: RawRecentFilings;
    // Filers with long histories page older filings into separate files
    // (filings.files[]); Atlas Research only reads the "recent" window
    // (SEC keeps roughly the last ~1000 filings there), which comfortably
    // covers everything a research tool needs — see the README's known
    // limitations for this deliberate scope decision.
  };
}

/** Converts SEC's columnar `filings.recent` (parallel arrays, one index per
 * filing) into a plain array of records — the one place in the app that
 * needs to know about that shape. */
function reshapeRecentFilings(recent: RawRecentFilings): SecFilingListEntry[] {
  const count = recent.accessionNumber.length;
  const filings: SecFilingListEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    filings.push({
      accessionNumber: recent.accessionNumber[i] ?? '',
      form: recent.form[i] ?? '',
      filingDate: recent.filingDate[i] ?? '',
      reportDate: recent.reportDate[i] || null,
      items: recent.items[i] || null,
      primaryDocument: recent.primaryDocument[i] ?? '',
      primaryDocDescription: recent.primaryDocDescription?.[i] || null,
      size: recent.size?.[i] ?? null,
      isXBRL: recent.isXBRL?.[i] === 1,
    });
  }

  return filings;
}

/** Fetches a company's filing history (10-K, 10-Q, 8-K, and everything else
 * SEC has on file — the caller filters to supported form types). */
export async function getSubmissions(cik10: string): Promise<SecSubmissions> {
  const raw = await fetchSec<RawSubmissionsResponse>(SUBMISSIONS_URL(cik10));
  return {
    cik: String(raw.cik),
    name: raw.name,
    filings: reshapeRecentFilings(raw.filings.recent),
  };
}

/** Builds the public sec.gov URL for a filing's primary document, following
 * SEC's Archives URL convention: CIK without leading zeros, accession number
 * without dashes. */
export function buildFilingUrl(cik10: string, accessionNumber: string, primaryDocument: string): string {
  const cikNoLeadingZeros = String(Number(cik10));
  const accessionNoDashes = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accessionNoDashes}/${primaryDocument}`;
}
