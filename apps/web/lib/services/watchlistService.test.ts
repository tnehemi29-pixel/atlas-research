import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

/**
 * Integration test against the real local Postgres — ownership enforcement
 * (the entire point of getOwnedWatchlist) is a claim about actual rows and
 * actual userId columns, not something a mock can verify. quickValuation is
 * mocked so row enrichment doesn't make real network calls.
 */

vi.mock('@/lib/valuation/quickValuation', () => ({
  getQuickFundamentals: vi.fn(),
  getQuickDcf: vi.fn(),
}));

import {
  addCompanyToWatchlist,
  createWatchlist,
  deleteWatchlist,
  DuplicateWatchlistCompanyError,
  DuplicateWatchlistNameError,
  getWatchlistDetail,
  listWatchlists,
  removeCompanyFromWatchlist,
  renameWatchlist,
  reorderWatchlistCompanies,
  WatchlistNotFoundError,
} from './watchlistService';
import { getQuickDcf, getQuickFundamentals } from '@/lib/valuation/quickValuation';

const TEST_EMAIL = 'zz-watchlist-test@example.com';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function makeCompany(ticker: string) {
  return db.company.upsert({ where: { ticker }, create: { ticker, name: `${ticker} Inc.` }, update: {} });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: { in: ['ZZWATCH1', 'ZZWATCH2'] } } });
}

describe('watchlistService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(() => {
    vi.mocked(getQuickFundamentals).mockReset();
    vi.mocked(getQuickDcf).mockReset();
  });

  it('creates, lists, renames, and deletes a watchlist', async () => {
    const user = await makeUser('crud');

    const created = await createWatchlist(user.id, 'Long-Term Ideas');
    expect(created.userId).toBe(user.id);

    const list = await listWatchlists(user.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Long-Term Ideas');

    const renamed = await renameWatchlist(user.id, created.id, 'Renamed List');
    expect(renamed.name).toBe('Renamed List');

    await deleteWatchlist(user.id, created.id);
    expect(await listWatchlists(user.id)).toHaveLength(0);
  });

  it('rejects a duplicate watchlist name for the same user', async () => {
    const user = await makeUser('dup-name');
    await createWatchlist(user.id, 'Tech');
    await expect(createWatchlist(user.id, 'Tech')).rejects.toBeInstanceOf(DuplicateWatchlistNameError);
  });

  it('allows two different users to each have a watchlist with the same name', async () => {
    const userA = await makeUser('same-name-a');
    const userB = await makeUser('same-name-b');
    await expect(createWatchlist(userA.id, 'Tech')).resolves.toBeTruthy();
    await expect(createWatchlist(userB.id, 'Tech')).resolves.toBeTruthy();
  });

  it('adds and removes companies, enriching rows via quickValuation', async () => {
    const user = await makeUser('companies');
    await makeCompany('ZZWATCH1');
    const watchlist = await createWatchlist(user.id, 'Research Queue');

    vi.mocked(getQuickFundamentals).mockResolvedValue({
      ticker: 'ZZWATCH1',
      name: 'ZZWATCH1 Inc.',
      sector: null,
      industry: null,
      price: 50,
      marketCap: 1_000_000_000,
      revenue: 100_000_000,
      revenueGrowth: 0.1,
      operatingMargin: 0.2,
      freeCashFlow: 20_000_000,
      evToEbitda: 12,
      peRatio: 18,
    });
    vi.mocked(getQuickDcf).mockResolvedValue({ currentSharePrice: 50, impliedSharePrice: 60, upsideDownside: 0.2, isValid: true, wacc: 0.09 });

    await addCompanyToWatchlist(user.id, watchlist.id, 'zzwatch1');

    const detail = await getWatchlistDetail(user.id, watchlist.id);
    expect(detail.rows).toHaveLength(1);
    expect(detail.rows[0]?.ticker).toBe('ZZWATCH1');
    expect(detail.rows[0]?.dcfImpliedPrice).toBe(60);
    expect(detail.rows[0]?.evToEbitda).toBe(12);

    await removeCompanyFromWatchlist(user.id, watchlist.id, 'ZZWATCH1');
    expect((await getWatchlistDetail(user.id, watchlist.id)).rows).toHaveLength(0);
  });

  it('rejects adding the same company to a watchlist twice', async () => {
    const user = await makeUser('dup-company');
    await makeCompany('ZZWATCH2');
    const watchlist = await createWatchlist(user.id, 'M&A Candidates');

    vi.mocked(getQuickFundamentals).mockResolvedValue(null as never);
    vi.mocked(getQuickDcf).mockResolvedValue(null);

    await addCompanyToWatchlist(user.id, watchlist.id, 'ZZWATCH2');
    await expect(addCompanyToWatchlist(user.id, watchlist.id, 'ZZWATCH2')).rejects.toBeInstanceOf(DuplicateWatchlistCompanyError);
  });

  it('reorders companies by ticker', async () => {
    const user = await makeUser('reorder');
    await makeCompany('ZZWATCH1');
    await makeCompany('ZZWATCH2');
    const watchlist = await createWatchlist(user.id, 'Reorder Test');

    vi.mocked(getQuickFundamentals).mockResolvedValue(null as never);
    vi.mocked(getQuickDcf).mockResolvedValue(null);

    await addCompanyToWatchlist(user.id, watchlist.id, 'ZZWATCH1');
    await addCompanyToWatchlist(user.id, watchlist.id, 'ZZWATCH2');

    await reorderWatchlistCompanies(user.id, watchlist.id, ['ZZWATCH2', 'ZZWATCH1']);

    const detail = await getWatchlistDetail(user.id, watchlist.id);
    expect(detail.rows.map((r) => r.ticker)).toEqual(['ZZWATCH2', 'ZZWATCH1']);
  });

  it('prevents User B from reading, renaming, or deleting User A watchlist', async () => {
    const userA = await makeUser('secure-a');
    const userB = await makeUser('secure-b');
    const watchlist = await createWatchlist(userA.id, 'Private List');

    await expect(getWatchlistDetail(userB.id, watchlist.id)).rejects.toBeInstanceOf(WatchlistNotFoundError);
    await expect(renameWatchlist(userB.id, watchlist.id, 'Hijacked')).rejects.toBeInstanceOf(WatchlistNotFoundError);
    await expect(deleteWatchlist(userB.id, watchlist.id)).rejects.toBeInstanceOf(WatchlistNotFoundError);
    await expect(addCompanyToWatchlist(userB.id, watchlist.id, 'ZZWATCH1')).rejects.toBeInstanceOf(WatchlistNotFoundError);

    // Still fully intact for its actual owner.
    const stillOwned = await getWatchlistDetail(userA.id, watchlist.id);
    expect(stillOwned.watchlist.name).toBe('Private List');
  });
});
