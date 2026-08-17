import type { Company } from '@prisma/client';
import type { CompanyOverview, CompanySearchResult } from '@erp/types';
import { db } from '@/lib/db';
import { TtlCache } from '@/lib/cache/ttlCache';
import { getCompanyProfileFmp, searchCompaniesFmp, type FmpProfile } from '@/lib/providers/fmp';

// FMP's /search endpoint isn't scoped to US markets — narrow to the
// exchanges that matter for "any U.S. publicly traded company."
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX']);
const MAX_SEARCH_RESULTS = 8;
const SEARCH_CACHE_TTL_MS = 30_000;
// How long a cached quote/profile is considered fresh before we hit FMP again.
const QUOTE_FRESHNESS_MS = 15 * 60 * 1000;

const searchCache = new TtlCache<CompanySearchResult[]>(SEARCH_CACHE_TTL_MS);

export async function searchCompanies(rawQuery: string): Promise<CompanySearchResult[]> {
  const query = rawQuery.trim();
  if (query.length === 0) return [];

  const cacheKey = query.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const raw = await searchCompaniesFmp(query, 15);
  const usMatches = raw
    .filter((result) => result.exchange !== null && US_EXCHANGES.has(result.exchange))
    .slice(0, MAX_SEARCH_RESULTS);

  // Enrich with industry from our own cache when we already have it — the
  // search provider doesn't return industry, but a company's overview page
  // (companyService.getCompanyOverview) fills this in the moment anyone
  // views it, so results get richer over time without extra provider calls.
  const tickers = usMatches.map((result) => result.ticker);
  const cachedRows = tickers.length
    ? await db.company.findMany({
        where: { ticker: { in: tickers } },
        select: { ticker: true, industry: true },
      })
    : [];
  const industryByTicker = new Map(cachedRows.map((row) => [row.ticker, row.industry]));

  const results: CompanySearchResult[] = usMatches.map((result) => ({
    ticker: result.ticker,
    name: result.name,
    exchange: result.exchange,
    industry: industryByTicker.get(result.ticker) ?? null,
  }));

  searchCache.set(cacheKey, results);
  return results;
}

function profileFields(profile: FmpProfile) {
  return {
    name: profile.name,
    exchange: profile.exchange,
    sector: profile.sector,
    industry: profile.industry,
    country: profile.country,
    logoUrl: profile.logoUrl,
    price: profile.price,
    changePercent: profile.changePercent,
    marketCap: profile.marketCap,
    yearHigh: profile.yearHigh,
    yearLow: profile.yearLow,
    beta: profile.beta,
    quoteUpdatedAt: new Date(),
  };
}

function toOverview(company: Company, stale: boolean): CompanyOverview {
  return {
    ticker: company.ticker,
    name: company.name,
    exchange: company.exchange,
    sector: company.sector,
    industry: company.industry,
    country: company.country,
    logoUrl: company.logoUrl,
    price: company.price,
    changePercent: company.changePercent,
    marketCap: company.marketCap,
    yearHigh: company.yearHigh,
    yearLow: company.yearLow,
    beta: company.beta,
    quoteUpdatedAt: company.quoteUpdatedAt ? company.quoteUpdatedAt.toISOString() : null,
    stale,
  };
}

/**
 * Returns the overview for a ticker, or null if the ticker genuinely doesn't
 * exist. Errors thrown from this function mean "the provider is unreachable
 * and we have no cached fallback" — that's a 503, not a 404, and the caller
 * (the API route / the page) is responsible for telling them apart.
 */
export async function getCompanyOverview(rawTicker: string): Promise<CompanyOverview | null> {
  const ticker = rawTicker.trim().toUpperCase();
  if (ticker.length === 0) return null;

  const existing = await db.company.findUnique({ where: { ticker } });
  const isFresh = Boolean(
    existing?.quoteUpdatedAt && Date.now() - existing.quoteUpdatedAt.getTime() < QUOTE_FRESHNESS_MS,
  );

  if (existing && isFresh) {
    return toOverview(existing, false);
  }

  let profile: FmpProfile | null;
  try {
    profile = await getCompanyProfileFmp(ticker);
  } catch (error) {
    if (existing) {
      // Provider is down but we have a (stale) cached snapshot — degrade
      // gracefully instead of failing the page.
      return toOverview(existing, true);
    }
    throw error;
  }

  if (!profile) {
    // FMP explicitly has no such ticker.
    return existing ? toOverview(existing, true) : null;
  }

  const saved = await db.company.upsert({
    where: { ticker },
    create: { ticker, ...profileFields(profile) },
    update: profileFields(profile),
  });

  return toOverview(saved, false);
}

/**
 * Returns the Company row for a ticker, creating a bare-identity one if it
 * doesn't exist yet. Used by financialDataService so financial-statement
 * lookups don't depend on the company having been searched/viewed via the
 * FMP-backed overview flow first — the two data sources (FMP quotes, SEC
 * filings) are independent, and this keeps them that way.
 */
export async function ensureCompanyByTicker(
  rawTicker: string,
  fallbackName?: string,
): Promise<Company> {
  const ticker = rawTicker.trim().toUpperCase();
  const existing = await db.company.findUnique({ where: { ticker } });
  if (existing) return existing;

  return db.company.create({ data: { ticker, name: fallbackName ?? ticker } });
}
