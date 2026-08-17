import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

/**
 * Integration test against the real local Postgres — ownership enforcement,
 * default-portfolio auto-creation, and duplicate-holding prevention are all
 * claims about actual rows, not something a mock can verify. quickValuation
 * is mocked so enrichment never makes real network calls.
 */

vi.mock('@/lib/valuation/quickValuation', () => ({
  getQuickFundamentals: vi.fn(),
  getQuickDcf: vi.fn(),
  getQuickComps: vi.fn(),
}));

import {
  addHolding,
  DuplicateHoldingError,
  editHolding,
  getOrCreateDefaultPortfolio,
  getPortfolioAnalytics,
  getPortfolioDetail,
  HoldingNotFoundError,
  InvalidHoldingInputError,
  removeHolding,
} from './portfolioService';
import { getQuickComps, getQuickDcf, getQuickFundamentals } from '@/lib/valuation/quickValuation';

const TEST_EMAIL = 'zz-portfolio-test@example.com';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function makeCompany(ticker: string, overrides: Partial<{ sector: string; industry: string; price: number }> = {}) {
  return db.company.upsert({
    where: { ticker },
    create: { ticker, name: `${ticker} Inc.`, sector: overrides.sector ?? null, industry: overrides.industry ?? null, price: overrides.price ?? null },
    update: {},
  });
}

function fundamentals(overrides: Partial<Awaited<ReturnType<typeof getQuickFundamentals>>> = {}) {
  return {
    ticker: 'ZZPORT1',
    name: 'ZZPORT1 Inc.',
    sector: 'Technology',
    industry: 'Software',
    price: 100,
    marketCap: 1_000_000_000,
    revenue: 500_000_000,
    revenueGrowth: 0.15,
    operatingMargin: 0.25,
    freeCashFlow: 100_000_000,
    evToEbitda: 14,
    peRatio: 22,
    ...overrides,
  };
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: { in: ['ZZPORT1', 'ZZPORT2'] } } });
}

describe('portfolioService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(() => {
    vi.mocked(getQuickFundamentals).mockReset();
    vi.mocked(getQuickDcf).mockReset();
    vi.mocked(getQuickComps).mockReset();
  });

  it('auto-creates one default portfolio per user, idempotently', async () => {
    const user = await makeUser('default');
    const first = await getOrCreateDefaultPortfolio(user.id);
    expect(first.name).toBe('Personal Portfolio');

    const second = await getOrCreateDefaultPortfolio(user.id);
    expect(second.id).toBe(first.id);
  });

  it('adds a holding and computes market value, cost basis, gain/loss, and return', async () => {
    const user = await makeUser('add-holding');
    await makeCompany('ZZPORT1');
    vi.mocked(getQuickFundamentals).mockResolvedValue(fundamentals());

    await addHolding(user.id, { ticker: 'zzport1', shares: 10, averageCost: 80 });

    const detail = await getPortfolioDetail(user.id);
    const row = detail.holdings.find((h) => h.ticker === 'ZZPORT1');
    expect(row?.marketValue).toBe(1000); // 10 * 100
    expect(row?.costBasis).toBe(800); // 10 * 80
    expect(row?.unrealizedGainLoss).toBe(200);
    expect(row?.unrealizedReturn).toBeCloseTo(0.25);
    expect(row?.weight).toBe(1);
    expect(detail.summary.totalMarketValue).toBe(1000);
  });

  it('rejects adding the same ticker twice', async () => {
    const user = await makeUser('dup-holding');
    await makeCompany('ZZPORT1');
    vi.mocked(getQuickFundamentals).mockResolvedValue(fundamentals());

    await addHolding(user.id, { ticker: 'ZZPORT1', shares: 5, averageCost: 50 });
    await expect(addHolding(user.id, { ticker: 'ZZPORT1', shares: 5, averageCost: 50 })).rejects.toBeInstanceOf(DuplicateHoldingError);
  });

  it('rejects non-positive shares and negative average cost', async () => {
    const user = await makeUser('invalid-input');
    await makeCompany('ZZPORT1');

    await expect(addHolding(user.id, { ticker: 'ZZPORT1', shares: 0, averageCost: 10 })).rejects.toBeInstanceOf(InvalidHoldingInputError);
    await expect(addHolding(user.id, { ticker: 'ZZPORT1', shares: -5, averageCost: 10 })).rejects.toBeInstanceOf(InvalidHoldingInputError);
    await expect(addHolding(user.id, { ticker: 'ZZPORT1', shares: 5, averageCost: -1 })).rejects.toBeInstanceOf(InvalidHoldingInputError);
  });

  it('handles a zero cost basis without dividing by zero', async () => {
    const user = await makeUser('zero-cost');
    await makeCompany('ZZPORT1');
    vi.mocked(getQuickFundamentals).mockResolvedValue(fundamentals());

    await addHolding(user.id, { ticker: 'ZZPORT1', shares: 10, averageCost: 0 });
    const detail = await getPortfolioDetail(user.id);
    const row = detail.holdings[0];
    expect(row?.costBasis).toBe(0);
    expect(row?.unrealizedReturn).toBeNull();
  });

  it('handles fractional shares', async () => {
    const user = await makeUser('fractional');
    await makeCompany('ZZPORT1');
    vi.mocked(getQuickFundamentals).mockResolvedValue(fundamentals({ price: 40 }));

    await addHolding(user.id, { ticker: 'ZZPORT1', shares: 2.5, averageCost: 30 });
    const detail = await getPortfolioDetail(user.id);
    expect(detail.holdings[0]?.marketValue).toBe(100);
    expect(detail.holdings[0]?.costBasis).toBe(75);
  });

  it('flags a missing price without crashing the summary', async () => {
    const user = await makeUser('missing-price');
    await makeCompany('ZZPORT1');
    vi.mocked(getQuickFundamentals).mockResolvedValue(fundamentals({ price: null }));

    await addHolding(user.id, { ticker: 'ZZPORT1', shares: 10, averageCost: 50 });
    const detail = await getPortfolioDetail(user.id);
    expect(detail.holdings[0]?.marketValue).toBeNull();
    expect(detail.summary.hasMissingPrices).toBe(true);
  });

  it('edits and removes a holding', async () => {
    const user = await makeUser('edit-remove');
    await makeCompany('ZZPORT1');
    vi.mocked(getQuickFundamentals).mockResolvedValue(fundamentals());

    const holding = await addHolding(user.id, { ticker: 'ZZPORT1', shares: 10, averageCost: 50 });
    const edited = await editHolding(user.id, holding.id, { shares: 20, notes: 'Added more.' });
    expect(edited.shares).toBe(20);
    expect(edited.notes).toBe('Added more.');

    await removeHolding(user.id, holding.id);
    const detail = await getPortfolioDetail(user.id);
    expect(detail.holdings).toHaveLength(0);
  });

  it('computes sector allocation and weighted fundamentals across two holdings', async () => {
    const user = await makeUser('allocation');
    await makeCompany('ZZPORT1');
    await makeCompany('ZZPORT2');

    vi.mocked(getQuickFundamentals).mockImplementation(async (ticker: string) => {
      if (ticker === 'ZZPORT1') return fundamentals({ ticker: 'ZZPORT1', price: 100, sector: 'Technology', revenueGrowth: 0.2 });
      return fundamentals({ ticker: 'ZZPORT2', price: 50, sector: 'Financials', revenueGrowth: 0.1 });
    });
    vi.mocked(getQuickDcf).mockResolvedValue(null);
    vi.mocked(getQuickComps).mockResolvedValue(null);

    await addHolding(user.id, { ticker: 'ZZPORT1', shares: 10, averageCost: 90 }); // MV 1000
    await addHolding(user.id, { ticker: 'ZZPORT2', shares: 20, averageCost: 40 }); // MV 1000

    const analytics = await getPortfolioAnalytics(user.id);
    expect(analytics.sectorAllocation).toHaveLength(2);
    const tech = analytics.sectorAllocation.find((s) => s.label === 'Technology');
    expect(tech?.weight).toBeCloseTo(0.5);

    // Equal weight -> simple average of 0.2 and 0.1
    expect(analytics.weightedFundamentals.revenueGrowth).toBeCloseTo(0.15);
  });

  it('prevents User B from editing or removing User A holding', async () => {
    const userA = await makeUser('secure-a');
    const userB = await makeUser('secure-b');
    await makeCompany('ZZPORT1');
    vi.mocked(getQuickFundamentals).mockResolvedValue(fundamentals());

    const holding = await addHolding(userA.id, { ticker: 'ZZPORT1', shares: 10, averageCost: 50 });

    await expect(editHolding(userB.id, holding.id, { shares: 999 })).rejects.toBeInstanceOf(HoldingNotFoundError);
    await expect(removeHolding(userB.id, holding.id)).rejects.toBeInstanceOf(HoldingNotFoundError);

    const detailA = await getPortfolioDetail(userA.id);
    expect(detailA.holdings.find((h) => h.id === holding.id)?.shares).toBe(10);

    // User B's own portfolio is untouched/empty.
    const detailB = await getPortfolioDetail(userB.id);
    expect(detailB.holdings).toHaveLength(0);
  });
});
