import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

vi.mock('@/lib/valuation/quickValuation', () => ({
  getQuickDcfScenarios: vi.fn(),
  getQuickComps: vi.fn(),
}));
vi.mock('@/lib/services/researchEventFeedService', () => ({
  getCompanyTimeline: vi.fn(),
}));
vi.mock('@/lib/services/backtestService', () => ({
  runDcfForecastValidation: vi.fn(),
}));
vi.mock('@/lib/services/investmentCaseChallengeService', () => ({
  getThesisChallenges: vi.fn(),
}));

import { getQuickComps, getQuickDcfScenarios } from '@/lib/valuation/quickValuation';
import { getCompanyTimeline } from '@/lib/services/researchEventFeedService';
import { runDcfForecastValidation } from '@/lib/services/backtestService';
import { getThesisChallenges } from '@/lib/services/investmentCaseChallengeService';
import { createInvestmentCase, InvestmentCaseNotFoundError } from './investmentCaseService';
import { confirmReview, getReview, InvestmentCaseReviewNotFoundError, listReviews, startReview } from './investmentCaseReviewService';

const TEST_EMAIL = 'zz-icase-review-test@example.com';
const TICKER = 'ZZIREV1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

function mockDefaults() {
  vi.mocked(getCompanyTimeline).mockResolvedValue([]);
  vi.mocked(getQuickDcfScenarios).mockResolvedValue(null);
  vi.mocked(getQuickComps).mockResolvedValue(null);
  vi.mocked(runDcfForecastValidation).mockResolvedValue({ ticker: TICKER, comparisons: [], statsByMetric: [], methodology: ['A methodology line.'] });
  vi.mocked(getThesisChallenges).mockResolvedValue([]);
}

describe('investmentCaseReviewService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    await cleanup();
    vi.mocked(getCompanyTimeline).mockReset();
    vi.mocked(getQuickDcfScenarios).mockReset();
    vi.mocked(getQuickComps).mockReset();
    vi.mocked(runDcfForecastValidation).mockReset();
    vi.mocked(getThesisChallenges).mockReset();
  });

  it('starts a review with outcome null — a review is durable before it is ever confirmed', async () => {
    const user = await makeUser('start');
    mockDefaults();
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });

    const review = await startReview(user.id, investmentCase.id, 'QUARTERLY');
    expect(review.outcome).toBeNull();
    expect(review.type).toBe('QUARTERLY');

    const summary = review.summary as { sinceDate: string | null; newResearchEvents: unknown[] };
    expect(summary.sinceDate).toBeNull(); // first-ever review
  });

  it('only surfaces research events newer than the previous review (or case creation, for the first review)', async () => {
    const user = await makeUser('since-date');
    const oldEvent = { id: 'e1', category: 'FINANCIAL', type: 'FINANCIAL_CHANGE', title: 'Old event', description: '', materiality: 'MEDIUM', confidence: 'MEDIUM', eventDate: '2000-01-01T00:00:00.000Z' } as never;
    const newEvent = { id: 'e2', category: 'FINANCIAL', type: 'FINANCIAL_CHANGE', title: 'New event', description: '', materiality: 'HIGH', confidence: 'HIGH', eventDate: new Date(Date.now() + 60_000).toISOString() } as never;
    mockDefaults();
    vi.mocked(getCompanyTimeline).mockResolvedValue([newEvent, oldEvent]);

    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    const review = await startReview(user.id, investmentCase.id, 'AD_HOC');
    const summary = review.summary as { newResearchEvents: { id: string }[] };
    expect(summary.newResearchEvents.map((e) => e.id)).toEqual(['e2']);
  });

  it('includes assumption challenges phrased as potential challenges, sourced from the deterministic challenge engine', async () => {
    const user = await makeUser('challenges');
    mockDefaults();
    vi.mocked(getThesisChallenges).mockResolvedValue([
      { trigger: 'Revenue Growth moved...', metric: 'REVENUE_GROWTH', label: 'Revenue Growth', thesisAssumption: 0.15, currentValue: 0.1, unit: 'ratio', difference: -0.05, differenceKind: 'PERCENTAGE_POINTS', affectedAreas: ['DCF'], source: 'Current fundamentals' },
    ]);

    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    const review = await startReview(user.id, investmentCase.id, 'QUARTERLY');
    const summary = review.summary as { assumptionChallenges: { metric: string }[] };
    expect(summary.assumptionChallenges).toHaveLength(1);
    expect(summary.assumptionChallenges[0]?.metric).toBe('REVENUE_GROWTH');
  });

  it('confirmReview is the only function that sets outcome, and requires an explicit call', async () => {
    const user = await makeUser('confirm');
    mockDefaults();
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    const review = await startReview(user.id, investmentCase.id, 'QUARTERLY');
    expect(review.outcome).toBeNull();

    const confirmed = await confirmReview(user.id, investmentCase.id, review.id, 'CONTINUE_MONITORING', 'Nothing material changed.');
    expect(confirmed.outcome).toBe('CONTINUE_MONITORING');
    expect(confirmed.notes).toBe('Nothing material changed.');

    const refetched = await getReview(user.id, investmentCase.id, review.id);
    expect(refetched.outcome).toBe('CONTINUE_MONITORING');
  });

  it('enforces ownership on every review operation', async () => {
    const userA = await makeUser('own-a');
    const userB = await makeUser('own-b');
    mockDefaults();
    const investmentCase = await createInvestmentCase(userA.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    const review = await startReview(userA.id, investmentCase.id, 'QUARTERLY');

    await expect(startReview(userB.id, investmentCase.id, 'QUARTERLY')).rejects.toThrow(InvestmentCaseNotFoundError);
    await expect(getReview(userB.id, investmentCase.id, review.id)).rejects.toThrow(InvestmentCaseNotFoundError);
    await expect(confirmReview(userB.id, investmentCase.id, review.id, 'THESIS_VALID')).rejects.toThrow(InvestmentCaseNotFoundError);

    const reviews = await listReviews(userA.id, investmentCase.id);
    expect(reviews).toHaveLength(1);
  });

  it('throws for a review id that does not exist on this case', async () => {
    const user = await makeUser('missing-review');
    mockDefaults();
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    await expect(getReview(user.id, investmentCase.id, 'nonexistent')).rejects.toThrow(InvestmentCaseReviewNotFoundError);
  });
});
