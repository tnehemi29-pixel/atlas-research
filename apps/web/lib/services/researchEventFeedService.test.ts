import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

vi.mock('@/lib/services/researchEventDetectionService', () => ({ runResearchEventDetection: vi.fn().mockResolvedValue({ created: 0, updated: 0, unchanged: 0 }) }));

import { runResearchEventDetection } from '@/lib/services/researchEventDetectionService';
import {
  getCompanyTimeline,
  getResearchEventDetail,
  getResearchFeed,
  markAllResearchEventsRead,
  markResearchEventRead,
  markResearchEventUnread,
} from './researchEventFeedService';

/** Integration test against the real local Postgres — feed scoping and
 * read-state isolation are claims about actual stored rows per user, not
 * something a mock can verify. The underlying detection pipeline is mocked
 * out (already covered by researchEventDetectionService.test.ts) so this
 * file only exercises the read/write side. */

const TEST_EMAIL = 'zz-feed-test@example.com';
const TICKER_A = 'ZZFEEDA';
const TICKER_B = 'ZZFEEDB';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function makeCompany(ticker: string) {
  return db.company.upsert({ where: { ticker }, create: { ticker, name: `${ticker} Inc.` }, update: { researchEventsSyncedAt: new Date() } });
}

async function makeEvent(companyId: string, overrides: Partial<{ dedupeKey: string; category: 'SEC_FILING' | 'EARNINGS' | 'FINANCIAL' | 'VALUATION' | 'CORPORATE_EVENT'; type: 'NEW_FILING' | 'GUIDANCE_CHANGE'; materiality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; eventDate: Date }> = {}) {
  return db.researchEvent.create({
    data: {
      companyId,
      category: overrides.category ?? 'FINANCIAL',
      type: overrides.type ?? 'GUIDANCE_CHANGE',
      title: 'Test event',
      description: 'A test event.',
      materiality: overrides.materiality ?? 'HIGH',
      confidence: 'HIGH',
      dedupeKey: overrides.dedupeKey ?? `test:${Math.random().toString(36).slice(2)}`,
      eventDate: overrides.eventDate ?? new Date('2026-08-01'),
      sources: { create: [{ type: 'FINANCIAL_DATA', label: 'Test source' }] },
    },
  });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: { in: [TICKER_A, TICKER_B] } } });
}

describe('researchEventFeedService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    vi.mocked(runResearchEventDetection).mockClear();
    await db.researchEvent.deleteMany({ where: { company: { ticker: { in: [TICKER_A, TICKER_B] } } } });
  });

  it('returns an empty feed for a user with no followed companies', async () => {
    const user = await makeUser('empty');
    expect(await getResearchFeed(user.id)).toEqual({ items: [], unreadCount: 0 });
  });

  it('only shows events for companies the user actually follows', async () => {
    const userA = await makeUser('isolation-a');
    const userB = await makeUser('isolation-b');
    const companyA = await makeCompany(TICKER_A);
    await makeEvent(companyA.id);

    const watchlist = await db.watchlist.create({ data: { userId: userA.id, name: 'Watch' } });
    await db.watchlistCompany.create({ data: { watchlistId: watchlist.id, companyId: companyA.id, orderIndex: 0 } });

    const feedA = await getResearchFeed(userA.id);
    const feedB = await getResearchFeed(userB.id);

    expect(feedA.items).toHaveLength(1);
    expect(feedA.items[0]?.ticker).toBe(TICKER_A);
    expect(feedB.items).toHaveLength(0);
  });

  it('filters by minMateriality, category, and unreadOnly', async () => {
    const user = await makeUser('filters');
    const company = await makeCompany(TICKER_A);
    const watchlist = await db.watchlist.create({ data: { userId: user.id, name: 'Watch' } });
    await db.watchlistCompany.create({ data: { watchlistId: watchlist.id, companyId: company.id, orderIndex: 0 } });

    const low = await makeEvent(company.id, { materiality: 'LOW', category: 'SEC_FILING', type: 'NEW_FILING' });
    const high = await makeEvent(company.id, { materiality: 'HIGH', category: 'EARNINGS', type: 'GUIDANCE_CHANGE' });
    await markResearchEventRead(user.id, low.id);

    const highOnly = await getResearchFeed(user.id, { minMateriality: 'HIGH' });
    expect(highOnly.items.map((i) => i.id)).toEqual([high.id]);

    const secOnly = await getResearchFeed(user.id, { category: 'SEC_FILING' });
    expect(secOnly.items.map((i) => i.id)).toEqual([low.id]);

    const unreadOnly = await getResearchFeed(user.id, { unreadOnly: true });
    expect(unreadOnly.items.map((i) => i.id)).toEqual([high.id]);

    const full = await getResearchFeed(user.id);
    expect(full.unreadCount).toBe(1);
  });

  it('keeps read state private per user', async () => {
    const userA = await makeUser('readstate-a');
    const userB = await makeUser('readstate-b');
    const company = await makeCompany(TICKER_A);
    const event = await makeEvent(company.id);

    for (const user of [userA, userB]) {
      const watchlist = await db.watchlist.create({ data: { userId: user.id, name: 'Watch' } });
      await db.watchlistCompany.create({ data: { watchlistId: watchlist.id, companyId: company.id, orderIndex: 0 } });
    }

    await markResearchEventRead(userA.id, event.id);

    const feedA = await getResearchFeed(userA.id);
    const feedB = await getResearchFeed(userB.id);
    expect(feedA.items[0]?.isRead).toBe(true);
    expect(feedB.items[0]?.isRead).toBe(false);

    await markResearchEventUnread(userA.id, event.id);
    const feedAAgain = await getResearchFeed(userA.id);
    expect(feedAAgain.items[0]?.isRead).toBe(false);
  });

  it('marks every followed-company event as read via markAllResearchEventsRead', async () => {
    const user = await makeUser('markall');
    const company = await makeCompany(TICKER_A);
    const watchlist = await db.watchlist.create({ data: { userId: user.id, name: 'Watch' } });
    await db.watchlistCompany.create({ data: { watchlistId: watchlist.id, companyId: company.id, orderIndex: 0 } });

    await makeEvent(company.id);
    await makeEvent(company.id);
    const count = await markAllResearchEventsRead(user.id);
    expect(count).toBe(2);

    const feed = await getResearchFeed(user.id);
    expect(feed.unreadCount).toBe(0);
    expect(feed.items.every((i) => i.isRead)).toBe(true);
  });

  it('returns full event detail including changes, impacts, and source hrefs; null for a missing event', async () => {
    const user = await makeUser('detail');
    const company = await makeCompany(TICKER_A);
    const event = await db.researchEvent.create({
      data: {
        companyId: company.id,
        category: 'VALUATION',
        type: 'DCF_VALUATION_CHANGE',
        title: 'DCF valuation changed',
        description: 'test',
        materiality: 'HIGH',
        confidence: 'HIGH',
        dedupeKey: `detail:${Math.random()}`,
        eventDate: new Date(),
        sources: { create: [{ type: 'VALUATION', label: 'Atlas DCF Model' }] },
        changes: { create: [{ metric: 'DCF Implied Price (Base)', unit: 'usd_per_share', previousValue: 100, currentValue: 120, changeAbsolute: 20, changePercent: 0.2 }] },
        impacts: { create: [{ area: 'DCF', note: 'Potentially affects DCF revenue assumptions.' }] },
      },
    });

    const detail = await getResearchEventDetail(user.id, event.id);
    expect(detail?.changes[0]?.metric).toBe('DCF Implied Price (Base)');
    expect(detail?.impacts[0]?.area).toBe('DCF');
    expect(detail?.sources[0]?.href).toBe(`/company/${TICKER_A}/valuation`);
    expect(detail?.isRead).toBe(false);

    expect(await getResearchEventDetail(user.id, 'not-a-real-id')).toBeNull();
  });

  it('triggers detection only for stale companies when reading a timeline', async () => {
    const freshCompany = await makeCompany(TICKER_A);
    await db.company.update({ where: { id: freshCompany.id }, data: { researchEventsSyncedAt: new Date() } });

    await getCompanyTimeline(TICKER_A);
    expect(runResearchEventDetection).not.toHaveBeenCalled();

    const staleCompany = await makeCompany(TICKER_B);
    await db.company.update({ where: { id: staleCompany.id }, data: { researchEventsSyncedAt: null } });

    await getCompanyTimeline(TICKER_B);
    expect(runResearchEventDetection).toHaveBeenCalledWith(TICKER_B);
  });

  it('filters a company timeline by category', async () => {
    const company = await makeCompany(TICKER_A);
    await makeEvent(company.id, { category: 'SEC_FILING', type: 'NEW_FILING' });
    await makeEvent(company.id, { category: 'EARNINGS', type: 'GUIDANCE_CHANGE' });

    const filtered = await getCompanyTimeline(TICKER_A, { category: 'SEC_FILING' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.category).toBe('SEC_FILING');
  });
});
