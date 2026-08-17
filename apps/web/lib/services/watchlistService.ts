import { Prisma, type Watchlist } from '@prisma/client';
import { db } from '@/lib/db';
import { ensureCompanyByTicker } from '@/lib/services/companyService';
import { getQuickDcf, getQuickFundamentals } from '@/lib/valuation/quickValuation';

/**
 * Watchlist CRUD + row enrichment. Every mutation and read here is scoped by
 * `userId` first — `getOwnedWatchlist` is the single choke point that
 * decides whether a watchlist is visible/mutable at all, and it deliberately
 * returns the SAME "not found" outcome whether the id doesn't exist or
 * belongs to another user, so an API consumer probing IDs can never learn
 * "that id exists, you just don't own it" from the error alone. Row data
 * (price, margins, DCF) is never computed here — it's entirely delegated to
 * lib/valuation/quickValuation.ts, which itself only re-runs Milestones
 * 2-5's own services/engines. This file owns zero financial calculations.
 */

export class WatchlistNotFoundError extends Error {
  constructor(message = 'Watchlist not found.') {
    super(message);
    this.name = 'WatchlistNotFoundError';
  }
}

export class InvalidWatchlistNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWatchlistNameError';
  }
}

export class DuplicateWatchlistNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateWatchlistNameError';
  }
}

export class DuplicateWatchlistCompanyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateWatchlistCompanyError';
  }
}

export class CompanyNotFoundInWatchlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompanyNotFoundInWatchlistError';
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function getOwnedWatchlist(userId: string, watchlistId: string): Promise<Watchlist> {
  const watchlist = await db.watchlist.findUnique({ where: { id: watchlistId } });
  if (!watchlist || watchlist.userId !== userId) {
    throw new WatchlistNotFoundError();
  }
  return watchlist;
}

export async function listWatchlists(userId: string) {
  return db.watchlist.findMany({
    where: { userId },
    include: { _count: { select: { companies: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createWatchlist(userId: string, name: string): Promise<Watchlist> {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new InvalidWatchlistNameError('Watchlist name cannot be empty.');

  try {
    return await db.watchlist.create({ data: { userId, name: trimmed } });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateWatchlistNameError(`A watchlist named "${trimmed}" already exists.`);
    }
    throw error;
  }
}

export async function renameWatchlist(userId: string, watchlistId: string, name: string): Promise<Watchlist> {
  await getOwnedWatchlist(userId, watchlistId);

  const trimmed = name.trim();
  if (trimmed.length === 0) throw new InvalidWatchlistNameError('Watchlist name cannot be empty.');

  try {
    return await db.watchlist.update({ where: { id: watchlistId }, data: { name: trimmed } });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateWatchlistNameError(`A watchlist named "${trimmed}" already exists.`);
    }
    throw error;
  }
}

export async function deleteWatchlist(userId: string, watchlistId: string): Promise<void> {
  await getOwnedWatchlist(userId, watchlistId);
  await db.watchlist.delete({ where: { id: watchlistId } });
}

export interface WatchlistRow {
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

export interface WatchlistDetail {
  watchlist: Watchlist;
  rows: WatchlistRow[];
}

/** Every row's fundamentals + DCF are fetched in parallel — each call
 * reuses the same TTL-cached Company row/financial statements every other
 * page already shares, so two different users watching the same ticker
 * never doubles the underlying FMP/SEC requests. */
export async function getWatchlistDetail(userId: string, watchlistId: string): Promise<WatchlistDetail> {
  const watchlist = await getOwnedWatchlist(userId, watchlistId);

  const entries = await db.watchlistCompany.findMany({
    where: { watchlistId },
    include: { company: true },
    orderBy: { orderIndex: 'asc' },
  });

  const rows = await Promise.all(
    entries.map(async (entry): Promise<WatchlistRow> => {
      const [fundamentals, dcf] = await Promise.all([
        getQuickFundamentals(entry.company.ticker).catch(() => null),
        getQuickDcf(entry.company.ticker).catch(() => null),
      ]);

      return {
        companyId: entry.companyId,
        ticker: entry.company.ticker,
        name: entry.company.name,
        orderIndex: entry.orderIndex,
        price: fundamentals?.price ?? entry.company.price,
        marketCap: fundamentals?.marketCap ?? entry.company.marketCap,
        revenueGrowth: fundamentals?.revenueGrowth ?? null,
        operatingMargin: fundamentals?.operatingMargin ?? null,
        freeCashFlow: fundamentals?.freeCashFlow ?? null,
        evToEbitda: fundamentals?.evToEbitda ?? null,
        peRatio: fundamentals?.peRatio ?? null,
        dcfImpliedPrice: dcf?.impliedSharePrice ?? null,
        dcfUpsideDownside: dcf?.upsideDownside ?? null,
      };
    }),
  );

  return { watchlist, rows };
}

export async function addCompanyToWatchlist(userId: string, watchlistId: string, rawTicker: string) {
  await getOwnedWatchlist(userId, watchlistId);
  const ticker = rawTicker.trim().toUpperCase();
  const company = await ensureCompanyByTicker(ticker);

  const maxOrder = await db.watchlistCompany.aggregate({ where: { watchlistId }, _max: { orderIndex: true } });
  const orderIndex = (maxOrder._max.orderIndex ?? -1) + 1;

  try {
    return await db.watchlistCompany.create({ data: { watchlistId, companyId: company.id, orderIndex } });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateWatchlistCompanyError(`${ticker} is already on this watchlist.`);
    }
    throw error;
  }
}

export async function removeCompanyFromWatchlist(userId: string, watchlistId: string, rawTicker: string): Promise<void> {
  await getOwnedWatchlist(userId, watchlistId);
  const ticker = rawTicker.trim().toUpperCase();

  const company = await db.company.findUnique({ where: { ticker } });
  if (!company) throw new CompanyNotFoundInWatchlistError(`No company found for ticker "${ticker}".`);

  const result = await db.watchlistCompany.deleteMany({ where: { watchlistId, companyId: company.id } });
  if (result.count === 0) throw new CompanyNotFoundInWatchlistError(`${ticker} is not on this watchlist.`);
}

/** Reassigns `orderIndex` for the given companies (identified by ticker), in
 * the order supplied. Every update is scoped by `watchlistId` (already
 * ownership-checked) AND `companyId` together, so a ticker that isn't
 * actually on this watchlist simply matches zero rows rather than being
 * able to affect another watchlist's ordering. */
export async function reorderWatchlistCompanies(userId: string, watchlistId: string, orderedTickers: string[]): Promise<void> {
  await getOwnedWatchlist(userId, watchlistId);

  const tickers = orderedTickers.map((t) => t.trim().toUpperCase());
  const companies = await db.company.findMany({ where: { ticker: { in: tickers } } });
  const idByTicker = new Map(companies.map((c) => [c.ticker, c.id]));

  await db.$transaction(
    tickers
      .map((ticker, index) => ({ companyId: idByTicker.get(ticker), index }))
      .filter((entry): entry is { companyId: string; index: number } => Boolean(entry.companyId))
      .map(({ companyId, index }) =>
        db.watchlistCompany.updateMany({ where: { watchlistId, companyId }, data: { orderIndex: index } }),
      ),
  );
}
