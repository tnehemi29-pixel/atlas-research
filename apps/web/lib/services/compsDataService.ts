import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getCompanyOverview } from '@/lib/services/companyService';
import { getFinancials } from '@/lib/services/financialDataService';
import { getPeerTickersFmp, ProviderNotConfiguredError, ProviderRequestError } from '@/lib/providers/fmp';
import { buildValuationMetrics } from '@/lib/comps/metrics';
import { scorePeerCandidate } from '@/lib/comps/peerScoring';
import type { CompanyValuationMetrics, PeerCandidate } from '@/lib/comps/types';

/**
 * The boundary between Atlas Research's existing company/financials
 * infrastructure (companyService, financialDataService — Milestones 2-4,
 * reused unchanged) and the comps engine. This is the ONLY place peer
 * *candidates* are discovered; every candidate's actual financial data
 * still flows through the same pipeline as any other company page, so a
 * peer's multiples are never anything other than Atlas's own real data.
 */

// Bounds how many candidate tickers get a full metrics fetch — each one is a
// companyService + financialDataService round trip (DB-cached when
// possible, but potentially a live SEC/FMP call on first lookup), so an
// unbounded candidate list could mean dozens of external requests for one
// page load.
const MAX_CANDIDATE_UNIVERSE = 20;
const MAX_RANKED_CANDIDATES = 15;

export class CompsTargetNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompsTargetNotFoundError';
  }
}

/**
 * Builds one company's valuation-metrics snapshot from its overview (FMP)
 * and latest/prior annual financials (SEC EDGAR). Returns null only when
 * the ticker doesn't exist at all (no FMP profile). A company that exists
 * but has no synced SEC financials yet still returns a snapshot — just with
 * revenue/EBIT/etc. as null, exactly like any other missing-data case.
 */
export async function getCompanyValuationMetrics(rawTicker: string): Promise<CompanyValuationMetrics | null> {
  const ticker = rawTicker.trim().toUpperCase();
  if (ticker.length === 0) return null;

  const overview = await getCompanyOverview(ticker);
  if (!overview) return null;

  let periods: Awaited<ReturnType<typeof getFinancials>>['periods'] = [];
  let dataAsOf: string | null = null;
  try {
    const financials = await getFinancials(ticker, 'annual');
    periods = financials.periods; // already annual-only, newest-first (financialDataService)
    dataAsOf = financials.dataAsOf;
  } catch {
    // No SEC filer, or SEC unreachable with nothing cached — the company
    // still has an identity/quote from FMP, just no financial-statement
    // metrics. Every downstream field naturally comes out null.
  }

  return buildValuationMetrics(overview, periods[0] ?? null, periods[1] ?? null, dataAsOf);
}

/** Union of candidate tickers from Atlas's own database (companies sharing
 * the target's sector/industry that someone has already looked up) and
 * FMP's stock-peers endpoint, when configured. Never invents a candidate —
 * an empty result here (e.g. no FMP key and a sparsely-populated local DB)
 * is an honest reflection of what Atlas actually knows, not a bug. */
async function discoverCandidateTickers(ticker: string, target: CompanyValuationMetrics): Promise<Set<string>> {
  const candidates = new Set<string>();

  const orConditions: Prisma.CompanyWhereInput[] = [];
  if (target.industry) orConditions.push({ industry: target.industry });
  if (target.sector) orConditions.push({ sector: target.sector });

  if (orConditions.length > 0) {
    const dbMatches = await db.company.findMany({
      where: { ticker: { not: ticker }, OR: orConditions },
      select: { ticker: true },
      take: MAX_CANDIDATE_UNIVERSE,
    });
    dbMatches.forEach((row) => candidates.add(row.ticker));
  }

  try {
    const fmpPeers = await getPeerTickersFmp(ticker);
    fmpPeers.forEach((peerTicker) => candidates.add(peerTicker));
  } catch (error) {
    // FMP not configured, or unreachable — proceed with whatever the local
    // database found. This is the expected path in an environment with no
    // FMP_API_KEY, not an error condition worth surfacing to the user.
    if (!(error instanceof ProviderNotConfiguredError) && !(error instanceof ProviderRequestError)) throw error;
  }

  candidates.delete(ticker);
  return candidates;
}

/**
 * Discovers, fetches, and scores potential peers for a target company.
 * Ranked descending by similarity score. Throws CompsTargetNotFoundError if
 * the target ticker itself doesn't exist.
 */
export async function getPeerCandidates(rawTicker: string): Promise<PeerCandidate[]> {
  const ticker = rawTicker.trim().toUpperCase();
  const target = await getCompanyValuationMetrics(ticker);
  if (!target) {
    throw new CompsTargetNotFoundError(`No company found for "${ticker}".`);
  }

  const candidateTickers = [...(await discoverCandidateTickers(ticker, target))].slice(0, MAX_CANDIDATE_UNIVERSE);

  const fetched = await Promise.all(
    candidateTickers.map(async (candidateTicker) => {
      try {
        return await getCompanyValuationMetrics(candidateTicker);
      } catch {
        // One candidate failing to fetch (rate limit, transient error)
        // shouldn't fail the whole screen — it's just excluded.
        return null;
      }
    }),
  );

  const scored: PeerCandidate[] = fetched
    .filter((metrics): metrics is CompanyValuationMetrics => metrics !== null)
    .map((metrics) => ({ metrics, score: scorePeerCandidate(target, metrics) }));

  scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

  return scored.slice(0, MAX_RANKED_CANDIDATES);
}

export interface TargetAndPeers {
  target: CompanyValuationMetrics;
  peers: CompanyValuationMetrics[];
  /** Tickers the caller asked for that couldn't be resolved (don't exist,
   * or the provider was unreachable) — surfaced rather than silently
   * dropped, so the UI can tell the user a requested peer didn't load. */
  failedTickers: string[];
}

/**
 * Fetches the target plus an explicit, user-selected list of peer tickers —
 * the shared data-fetch used by the /comps, /valuation-multiples, and
 * /implied-valuation routes so none of them duplicate this logic.
 */
export async function fetchTargetAndPeers(rawTicker: string, peerTickers: string[]): Promise<TargetAndPeers> {
  const ticker = rawTicker.trim().toUpperCase();
  const target = await getCompanyValuationMetrics(ticker);
  if (!target) {
    throw new CompsTargetNotFoundError(`No company found for "${ticker}".`);
  }

  const uniquePeerTickers = [...new Set(peerTickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].filter(
    (t) => t !== ticker,
  );

  const results = await Promise.all(
    uniquePeerTickers.map(async (peerTicker) => {
      try {
        const metrics = await getCompanyValuationMetrics(peerTicker);
        return { peerTicker, metrics };
      } catch {
        return { peerTicker, metrics: null };
      }
    }),
  );

  const peers = results
    .filter((r): r is { peerTicker: string; metrics: CompanyValuationMetrics } => r.metrics !== null)
    .map((r) => r.metrics);
  const failedTickers = results.filter((r) => r.metrics === null).map((r) => r.peerTicker);

  return { target, peers, failedTickers };
}
