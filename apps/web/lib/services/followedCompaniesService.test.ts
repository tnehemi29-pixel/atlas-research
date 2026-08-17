import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { getFollowedCompanies } from './followedCompaniesService';

/** Integration test against the real local Postgres — this is the function
 * every monitoring feature (earnings calendar, filing monitor, research
 * feed, alerts) relies on to stay per-user private, so its scoping must be
 * verified against real rows, not a mock. */

const TEST_EMAIL = 'zz-followed-test@example.com';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function makeCompany(ticker: string) {
  return db.company.upsert({ where: { ticker }, create: { ticker, name: `${ticker} Inc.` }, update: {} });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: { in: ['ZZFOLLOW1', 'ZZFOLLOW2', 'ZZFOLLOW3'] } } });
}

describe('getFollowedCompanies', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('unions companies from watchlists and the portfolio, deduplicated', async () => {
    const user = await makeUser('union');
    const c1 = await makeCompany('ZZFOLLOW1');
    const c2 = await makeCompany('ZZFOLLOW2');

    const watchlist = await db.watchlist.create({ data: { userId: user.id, name: 'Tech' } });
    await db.watchlistCompany.createMany({
      data: [
        { watchlistId: watchlist.id, companyId: c1.id, orderIndex: 0 },
        { watchlistId: watchlist.id, companyId: c2.id, orderIndex: 1 },
      ],
    });

    const portfolio = await db.portfolio.create({ data: { userId: user.id, name: 'Personal Portfolio' } });
    // c1 appears in BOTH a watchlist and the portfolio — must still be one entry.
    await db.portfolioHolding.create({ data: { portfolioId: portfolio.id, companyId: c1.id, shares: 10, averageCost: 50 } });

    const followed = await getFollowedCompanies(user.id);
    expect(followed).toHaveLength(2);

    const c1Entry = followed.find((f) => f.ticker === 'ZZFOLLOW1');
    expect(c1Entry?.sources).toHaveLength(2);
    expect(c1Entry?.sources.map((s) => s.type).sort()).toEqual(['portfolio', 'watchlist']);

    const c2Entry = followed.find((f) => f.ticker === 'ZZFOLLOW2');
    expect(c2Entry?.sources).toEqual([{ type: 'watchlist', label: 'Tech' }]);
  });

  it("never returns another user's followed companies", async () => {
    const userA = await makeUser('secure-a');
    const userB = await makeUser('secure-b');
    const company = await makeCompany('ZZFOLLOW3');

    const watchlist = await db.watchlist.create({ data: { userId: userA.id, name: 'Private' } });
    await db.watchlistCompany.create({ data: { watchlistId: watchlist.id, companyId: company.id, orderIndex: 0 } });

    expect(await getFollowedCompanies(userA.id)).toHaveLength(1);
    expect(await getFollowedCompanies(userB.id)).toHaveLength(0);
  });

  it('returns an empty array for a user with no watchlists or portfolio', async () => {
    const user = await makeUser('empty');
    expect(await getFollowedCompanies(user.id)).toEqual([]);
  });
});
