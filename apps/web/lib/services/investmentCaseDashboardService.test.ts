import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

vi.mock('@/lib/investmentCase/context', () => ({ buildInvestmentCaseContext: vi.fn() }));

import { buildInvestmentCaseContext, type InvestmentCaseContext } from '@/lib/investmentCase/context';
import { createInvestmentCase } from './investmentCaseService';
import { getInvestmentCaseDashboard, REVIEW_OVERDUE_DAYS } from './investmentCaseDashboardService';

const TEST_EMAIL = 'zz-icase-dash-test@example.com';
const TICKER = 'ZZIDASH1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

function makeContext(overrides: Partial<InvestmentCaseContext> = {}): InvestmentCaseContext {
  return {
    caseId: 'x', ticker: TICKER, companyName: `${TICKER} Inc.`,
    businessOverview: { exchange: null, sector: null, industry: null, country: null, marketCap: null },
    status: 'ACTIVE_THESIS', horizon: '3-5 years', coreThesis: 'A thesis.', keyDrivers: [],
    bullSummary: null, baseSummary: null, bearSummary: null,
    strengthenIndicators: [], weakenIndicators: [], invalidateIndicators: [],
    assumptions: [], evidence: [],
    risks: [], catalysts: [], invalidationCriteria: [],
    financials: { revenue: null, revenueGrowth: null, operatingMargin: null, freeCashFlow: null },
    valuation: { currentSharePrice: 100, dcfBase: 120, dcfBull: null, dcfBear: null, compsImplied: null, evToEbitda: null, peRatio: null },
    challenges: [], invalidationEvaluations: [], recentResearchEvents: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('investmentCaseDashboardService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    await cleanup();
    vi.mocked(buildInvestmentCaseContext).mockReset();
  });

  it('returns a STABLE row with no challenges, no risks, and a recent review', async () => {
    const user = await makeUser('stable');
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    await db.investmentCaseReview.create({ data: { investmentCaseId: investmentCase.id, type: 'AD_HOC', outcome: 'THESIS_VALID', summary: {} } });
    vi.mocked(buildInvestmentCaseContext).mockResolvedValue(makeContext());

    const rows = await getInvestmentCaseDashboard(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.thesisHealth.status).toBe('STABLE');
    expect(rows[0]!.valuation.dcfBase).toBe(120);
    expect(rows[0]!.lastReviewedAt).not.toBeNull();
    expect(rows[0]!.contextUnavailable).toBe(false);
  });

  it('flags REVIEW_REQUIRED when an invalidation criterion is potentially met', async () => {
    const user = await makeUser('review-required');
    await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    vi.mocked(buildInvestmentCaseContext).mockResolvedValue(
      makeContext({ invalidationEvaluations: [{ criterionId: 'c1', description: 'x', checkable: true, potentiallyMet: true, latestValue: 5, thresholdValue: 8, comparator: 'LESS_THAN', reason: 'met' }] }),
    );

    const rows = await getInvestmentCaseDashboard(user.id);
    expect(rows[0]!.thesisHealth.status).toBe('REVIEW_REQUIRED');
  });

  it('degrades gracefully (contextUnavailable) when the live context cannot be built, without failing the whole dashboard', async () => {
    const user = await makeUser('degraded');
    await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    vi.mocked(buildInvestmentCaseContext).mockRejectedValue(new Error('no fundamentals'));

    const rows = await getInvestmentCaseDashboard(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contextUnavailable).toBe(true);
    expect(rows[0]!.valuation.dcfBase).toBeNull();
  });

  it('marks a review overdue past REVIEW_OVERDUE_DAYS', async () => {
    const user = await makeUser('overdue');
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    const longAgo = new Date(Date.now() - (REVIEW_OVERDUE_DAYS + 10) * 24 * 60 * 60 * 1000);
    await db.investmentCaseReview.create({ data: { investmentCaseId: investmentCase.id, type: 'AD_HOC', outcome: 'THESIS_VALID', reviewedAt: longAgo, summary: {} } });
    vi.mocked(buildInvestmentCaseContext).mockResolvedValue(makeContext());

    const rows = await getInvestmentCaseDashboard(user.id);
    expect(rows[0]!.thesisHealth.status).toBe('WATCH');
    expect(rows[0]!.thesisHealth.reasons.some((r) => r.includes('review is recommended'))).toBe(true);
  });

  it("never returns another user's case", async () => {
    const userA = await makeUser('isolation-a');
    const userB = await makeUser('isolation-b');
    await createInvestmentCase(userA.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    vi.mocked(buildInvestmentCaseContext).mockResolvedValue(makeContext());

    const rows = await getInvestmentCaseDashboard(userB.id);
    expect(rows).toHaveLength(0);
  });
});
