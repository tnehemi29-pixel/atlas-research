import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

vi.mock('@/lib/valuation/quickValuation', () => ({
  getQuickDcfScenarios: vi.fn(),
  getQuickFundamentals: vi.fn(),
}));

import { getQuickDcfScenarios, getQuickFundamentals } from '@/lib/valuation/quickValuation';
import { createInvestmentCase } from './investmentCaseService';
import { setAssumption } from './investmentCaseAssumptionService';
import { createInvalidationCriterion } from './investmentCaseInvalidationCriterionService';
import { getInvalidationEvaluations, getThesisChallenges } from './investmentCaseChallengeService';

const TEST_EMAIL = 'zz-icase-challenge-test@example.com';
const TICKER = 'ZZICHAL1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('investmentCaseChallengeService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    await cleanup();
    vi.mocked(getQuickDcfScenarios).mockReset();
    vi.mocked(getQuickFundamentals).mockReset();
  });

  it('matches the spec worked example end-to-end: 15% assumed revenue growth vs. 10% live trailing growth -> a Potential Challenge', async () => {
    const user = await makeUser('worked-example');
    vi.mocked(getQuickFundamentals).mockResolvedValue({
      ticker: TICKER, name: `${TICKER} Inc.`, sector: null, industry: null, price: 100, marketCap: 1_000_000_000,
      revenue: 500_000_000, revenueGrowth: 0.1, operatingMargin: 0.25, freeCashFlow: 80_000_000, evToEbitda: 15, peRatio: 20,
    });
    vi.mocked(getQuickDcfScenarios).mockResolvedValue(null);

    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    await setAssumption(user.id, investmentCase.id, { metric: 'REVENUE_GROWTH', value: 0.15, unit: 'ratio', asOfDate: '2026-08-01', source: 'Original thesis estimate' });

    const challenges = await getThesisChallenges(user.id, investmentCase.id);
    expect(challenges).toHaveLength(1);
    expect(challenges[0]).toMatchObject({ metric: 'REVENUE_GROWTH', thesisAssumption: 0.15, currentValue: 0.1, differenceKind: 'PERCENTAGE_POINTS' });
    expect(challenges[0]!.difference).toBeCloseTo(-0.05);
  });

  it('only compares BASE-scenario assumptions, never BULL/BEAR', async () => {
    const user = await makeUser('base-only');
    vi.mocked(getQuickFundamentals).mockResolvedValue({
      ticker: TICKER, name: `${TICKER} Inc.`, sector: null, industry: null, price: 100, marketCap: 1_000_000_000,
      revenue: 500_000_000, revenueGrowth: 0.1, operatingMargin: 0.25, freeCashFlow: 80_000_000, evToEbitda: 15, peRatio: 20,
    });
    vi.mocked(getQuickDcfScenarios).mockResolvedValue(null);

    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    // A BULL assumption far from live data should never fire — it's not the thesis's own expectation.
    await setAssumption(user.id, investmentCase.id, { metric: 'REVENUE_GROWTH', scenario: 'BULL', value: 0.3, unit: 'ratio', asOfDate: '2026-08-01', source: 'Bull case' });

    const challenges = await getThesisChallenges(user.id, investmentCase.id);
    expect(challenges).toHaveLength(0);
  });

  it('returns no challenges when there are no assumptions at all', async () => {
    const user = await makeUser('no-assumptions');
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    const challenges = await getThesisChallenges(user.id, investmentCase.id);
    expect(challenges).toEqual([]);
  });

  it('getInvalidationEvaluations never reports potentiallyMet as true without an explicit user confirmation elsewhere — it is purely advisory', async () => {
    const user = await makeUser('invalidation');
    vi.mocked(getQuickFundamentals).mockResolvedValue({
      ticker: TICKER, name: `${TICKER} Inc.`, sector: null, industry: null, price: 100, marketCap: 1_000_000_000,
      revenue: 500_000_000, revenueGrowth: 0.03, operatingMargin: 0.25, freeCashFlow: 80_000_000, evToEbitda: 15, peRatio: 20,
    });
    vi.mocked(getQuickDcfScenarios).mockResolvedValue(null);

    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    const criterion = await createInvalidationCriterion(user.id, investmentCase.id, {
      description: 'Revenue growth falls below 8%.',
      metric: 'REVENUE_GROWTH',
      comparator: 'LESS_THAN',
      thresholdValue: 0.08,
      thresholdUnit: 'ratio',
    });

    const evaluations = await getInvalidationEvaluations(user.id, investmentCase.id);
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]?.criterionId).toBe(criterion.id);
    expect(evaluations[0]?.potentiallyMet).toBe(true);
    expect(evaluations[0]?.reason.toLowerCase()).toContain('user confirmation is required');

    // The stored criterion's own status is untouched — this function never writes.
    const stored = await db.investmentCaseInvalidationCriterion.findUnique({ where: { id: criterion.id } });
    expect(stored?.status).toBe('ACTIVE');
  });
});
