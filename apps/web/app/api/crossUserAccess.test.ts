import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import type { User } from '@prisma/client';

/**
 * Milestone 10's explicit security requirement: "Create a test proving User
 * A cannot access User B's portfolio" — by changing an ID in the URL, not
 * merely at the service layer (already covered per-service in
 * watchlistService.test.ts, portfolioService.test.ts, alertService.test.ts,
 * savedReportService.test.ts, followedCompaniesService.test.ts) but through
 * the ACTUAL route handlers, exercising the real requireUser() auth guard +
 * ownership-check + status-code mapping end-to-end. `getCurrentUser` is
 * mocked (it needs a real Next.js request context to read cookies(), which
 * a direct route-handler import doesn't have) — everything downstream of it
 * runs unmocked against a real Postgres database.
 */

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return { ...actual, getCurrentUser: vi.fn() };
});
// Milestone 11's feed/timeline reads trigger TTL-gated lazy detection —
// mocked out here so these route tests never make a real network call;
// the detection pipeline itself is already covered end-to-end against real
// SEC/FMP-shaped fixtures in researchEventDetectionService.test.ts.
vi.mock('@/lib/services/researchEventDetectionService', () => ({ runResearchEventDetection: vi.fn().mockResolvedValue({ created: 0, updated: 0, unchanged: 0 }) }));

import { getCurrentUser } from '@/lib/auth/session';

const TEST_EMAIL = 'zz-cross-user-test@example.com';
const TICKER = 'ZZCROSSUSER';

function loginAs(user: User) {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function makeUser(suffix: string): Promise<User> {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  // Milestone 15 - workspaces created in tests below reference their
  // creator via a Restrict-on-delete FK, so they must be cleaned up before
  // the users that created them.
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('cross-user access is blocked at the API route layer', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(() => {
    vi.mocked(getCurrentUser).mockReset();
  });

  describe('watchlists', () => {
    it("User B gets 404 reading, renaming, and deleting User A's watchlist by ID", async () => {
      const userA = await makeUser('watchlist-a');
      const userB = await makeUser('watchlist-b');
      const watchlist = await db.watchlist.create({ data: { userId: userA.id, name: 'Private Watchlist' } });

      const { GET, PATCH, DELETE } = await import('./watchlists/[id]/route');

      loginAs(userB);
      const getRes = await GET(jsonRequest(`/api/watchlists/${watchlist.id}`, 'GET'), { params: { id: watchlist.id } });
      expect(getRes.status).toBe(404);

      const patchRes = await PATCH(jsonRequest(`/api/watchlists/${watchlist.id}`, 'PATCH', { name: 'Hijacked' }), { params: { id: watchlist.id } });
      expect(patchRes.status).toBe(404);

      const deleteRes = await DELETE(jsonRequest(`/api/watchlists/${watchlist.id}`, 'DELETE'), { params: { id: watchlist.id } });
      expect(deleteRes.status).toBe(404);

      // The watchlist is untouched — proving the 404s were real blocks, not
      // coincidental no-ops.
      loginAs(userA);
      const ownRes = await GET(jsonRequest(`/api/watchlists/${watchlist.id}`, 'GET'), { params: { id: watchlist.id } });
      expect(ownRes.status).toBe(200);
      const body = await ownRes.json();
      expect(body.watchlist.name).toBe('Private Watchlist');
    });

    it("User B cannot add a company to User A's watchlist", async () => {
      const userA = await makeUser('watchlist-add-a');
      const userB = await makeUser('watchlist-add-b');
      const watchlist = await db.watchlist.create({ data: { userId: userA.id, name: 'Another Private List' } });

      const { POST } = await import('./watchlists/[id]/companies/route');
      loginAs(userB);
      const res = await POST(jsonRequest(`/api/watchlists/${watchlist.id}/companies`, 'POST', { ticker: TICKER }), { params: { id: watchlist.id } });
      expect(res.status).toBe(404);
    });

    it('an unauthenticated request is rejected with 401, not silently allowed', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('./watchlists/route');
      const res = await GET();
      expect(res.status).toBe(401);
    });
  });

  describe('portfolio holdings', () => {
    it("User B gets 404 editing or removing User A's holding by ID", async () => {
      const userA = await makeUser('holding-a');
      const userB = await makeUser('holding-b');
      const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Cross User Co.' }, update: {} });
      const portfolio = await db.portfolio.create({ data: { userId: userA.id, name: 'Personal Portfolio' } });
      const holding = await db.portfolioHolding.create({ data: { portfolioId: portfolio.id, companyId: company.id, shares: 10, averageCost: 50 } });

      const { PATCH, DELETE } = await import('./portfolio/holdings/[id]/route');

      loginAs(userB);
      const patchRes = await PATCH(jsonRequest(`/api/portfolio/holdings/${holding.id}`, 'PATCH', { shares: 999 }), { params: { id: holding.id } });
      expect(patchRes.status).toBe(404);

      const deleteRes = await DELETE(jsonRequest(`/api/portfolio/holdings/${holding.id}`, 'DELETE'), { params: { id: holding.id } });
      expect(deleteRes.status).toBe(404);

      const stillThere = await db.portfolioHolding.findUnique({ where: { id: holding.id } });
      expect(stillThere?.shares).toBe(10);
    });

    it("User B's own /api/portfolio never returns User A's holdings", async () => {
      const userA = await makeUser('portfolio-view-a');
      const userB = await makeUser('portfolio-view-b');
      const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Cross User Co.' }, update: {} });
      const portfolioA = await db.portfolio.create({ data: { userId: userA.id, name: 'Personal Portfolio' } });
      await db.portfolioHolding.create({ data: { portfolioId: portfolioA.id, companyId: company.id, shares: 5, averageCost: 10 } });

      const { GET } = await import('./portfolio/route');
      loginAs(userB);
      const res = await GET();
      const body = await res.json();
      expect(body.holdings).toEqual([]);
    });
  });

  describe('alerts', () => {
    it("User B gets 404 toggling or deleting User A's alert by ID", async () => {
      // A higher timeout than the 5s default — this file runs many
      // real-Postgres integration tests in the same worker, and this
      // particular test can occasionally land after enough DB round trips
      // that Windows/Prisma connection contention pushes it past 5s.
      const userA = await makeUser('alert-a');
      const userB = await makeUser('alert-b');
      const alert = await db.researchAlert.create({ data: { userId: userA.id, type: 'NEW_SEC_FILING' } });

      const { PATCH, DELETE } = await import('./alerts/[id]/route');

      loginAs(userB);
      const patchRes = await PATCH(jsonRequest(`/api/alerts/${alert.id}`, 'PATCH', { isActive: false }), { params: { id: alert.id } });
      expect(patchRes.status).toBe(404);

      const deleteRes = await DELETE(jsonRequest(`/api/alerts/${alert.id}`, 'DELETE'), { params: { id: alert.id } });
      expect(deleteRes.status).toBe(404);

      const stillActive = await db.researchAlert.findUnique({ where: { id: alert.id } });
      expect(stillActive?.isActive).toBe(true);
    }, 15000);

    it("User B's /api/alerts list never includes User A's alerts", async () => {
      const userA = await makeUser('alert-list-a');
      const userB = await makeUser('alert-list-b');
      // Unscoped (no companyId) — evaluation would check every followed
      // company, but userA follows none here, so it resolves without any
      // external calls.
      await db.researchAlert.create({ data: { userId: userA.id, type: 'NEW_SEC_FILING' } });

      const { GET } = await import('./alerts/route');
      loginAs(userB);
      const res = await GET();
      const body = await res.json();
      expect(body).toEqual([]);
    });
  });

  describe('saved reports', () => {
    it("User B unsaving User A's bookmark by researchReportId is a no-op, never an error that reveals it exists", async () => {
      const userA = await makeUser('saved-a');
      const userB = await makeUser('saved-b');
      const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Cross User Co.' }, update: {} });
      const report = await db.researchReport.create({
        data: { companyId: company.id, version: 1, status: 'SUCCESS', model: 'fixture', dataSnapshotAt: new Date(), content: { context: {}, report: null } },
      });
      await db.savedReport.create({ data: { userId: userA.id, researchReportId: report.id } });

      const { DELETE } = await import('./reports/saved/[reportId]/route');
      loginAs(userB);
      const res = await DELETE(jsonRequest(`/api/reports/saved/${report.id}`, 'DELETE'), { params: { reportId: report.id } });
      expect(res.status).toBe(200); // idempotent no-op, not an information-leaking error

      // A's bookmark is untouched.
      const stillSaved = await db.savedReport.findUnique({ where: { userId_researchReportId: { userId: userA.id, researchReportId: report.id } } });
      expect(stillSaved).not.toBeNull();
    });
  });

  describe('research feed (Milestone 11)', () => {
    it("User B's /api/research-feed never includes an event for a company only User A follows", async () => {
      const userA = await makeUser('feed-a');
      const userB = await makeUser('feed-b');
      const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Cross User Co.' }, update: {} });
      await db.researchEvent.create({
        data: {
          companyId: company.id,
          category: 'FINANCIAL',
          type: 'FINANCIAL_CHANGE',
          title: 'Cross-user test event',
          description: 'x',
          materiality: 'HIGH',
          confidence: 'HIGH',
          dedupeKey: `crossuser:${Date.now()}`,
          eventDate: new Date(),
          sources: { create: [{ type: 'FINANCIAL_DATA', label: 'test' }] },
        },
      });
      const watchlist = await db.watchlist.create({ data: { userId: userA.id, name: 'Cross-user Watch' } });
      await db.watchlistCompany.create({ data: { watchlistId: watchlist.id, companyId: company.id, orderIndex: 0 } });

      const { GET } = await import('./research-feed/route');
      loginAs(userB);
      const res = await GET(jsonRequest('/api/research-feed', 'GET'));
      const body = await res.json();
      expect(body.items).toEqual([]);

      loginAs(userA);
      const ownRes = await GET(jsonRequest('/api/research-feed', 'GET'));
      const ownBody = await ownRes.json();
      expect(ownBody.items).toHaveLength(1);
    });

    it("User A marking a global event read never marks it read for User B — read state is per-user, not per-event", async () => {
      const userA = await makeUser('feed-read-a');
      const userB = await makeUser('feed-read-b');
      const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Cross User Co.' }, update: {} });
      const event = await db.researchEvent.create({
        data: {
          companyId: company.id,
          category: 'FINANCIAL',
          type: 'FINANCIAL_CHANGE',
          title: 'Cross-user read-state event',
          description: 'x',
          materiality: 'HIGH',
          confidence: 'HIGH',
          dedupeKey: `crossuser-read:${Date.now()}`,
          eventDate: new Date(),
          sources: { create: [{ type: 'FINANCIAL_DATA', label: 'test' }] },
        },
      });

      const { POST: markRead } = await import('./research-feed/[eventId]/read/route');
      const { GET: getDetail } = await import('./research-feed/[eventId]/route');

      loginAs(userA);
      const readRes = await markRead(jsonRequest(`/api/research-feed/${event.id}/read`, 'POST'), { params: { eventId: event.id } });
      expect(readRes.status).toBe(200);

      const aDetail = await (await getDetail(jsonRequest(`/api/research-feed/${event.id}`, 'GET'), { params: { eventId: event.id } })).json();
      expect(aDetail.isRead).toBe(true);

      loginAs(userB);
      const bDetail = await (await getDetail(jsonRequest(`/api/research-feed/${event.id}`, 'GET'), { params: { eventId: event.id } })).json();
      expect(bDetail.isRead).toBe(false);
    });
  });

  describe('investment cases (Milestone 13)', () => {
    async function makeCase(userId: string) {
      const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Cross User Co.' }, update: {} });
      return db.investmentCase.create({
        data: { userId, companyId: company.id, horizon: '3-5 years', coreThesis: 'A thesis.' },
      });
    }

    it("User B gets 404 reading, updating, and deleting User A's investment case by ID", async () => {
      const userA = await makeUser('icase-a');
      const userB = await makeUser('icase-b');
      const investmentCase = await makeCase(userA.id);

      const { GET, PATCH, DELETE } = await import('./investment-cases/[id]/route');

      loginAs(userB);
      const getRes = await GET(jsonRequest(`/api/investment-cases/${investmentCase.id}`, 'GET'), { params: { id: investmentCase.id } });
      expect(getRes.status).toBe(404);

      const patchRes = await PATCH(jsonRequest(`/api/investment-cases/${investmentCase.id}`, 'PATCH', { coreThesis: 'Hijacked' }), { params: { id: investmentCase.id } });
      expect(patchRes.status).toBe(404);

      const deleteRes = await DELETE(jsonRequest(`/api/investment-cases/${investmentCase.id}`, 'DELETE'), { params: { id: investmentCase.id } });
      expect(deleteRes.status).toBe(404);

      loginAs(userA);
      const ownRes = await GET(jsonRequest(`/api/investment-cases/${investmentCase.id}`, 'GET'), { params: { id: investmentCase.id } });
      expect(ownRes.status).toBe(200);
      const body = await ownRes.json();
      expect(body.coreThesis).toBe('A thesis.');
    });

    it("User B's /api/investment-cases list never includes User A's case", async () => {
      const userA = await makeUser('icase-list-a');
      const userB = await makeUser('icase-list-b');
      await makeCase(userA.id);

      const { GET } = await import('./investment-cases/route');
      loginAs(userB);
      const res = await GET();
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("User B cannot add an assumption, evidence item, risk, catalyst, or invalidation criterion to User A's case", async () => {
      const userA = await makeUser('icase-child-a');
      const userB = await makeUser('icase-child-b');
      const investmentCase = await makeCase(userA.id);

      const { POST: postAssumption } = await import('./investment-cases/[id]/assumptions/route');
      const { POST: postEvidence } = await import('./investment-cases/[id]/evidence/route');
      const { POST: postRisk } = await import('./investment-cases/[id]/risks/route');
      const { POST: postCatalyst } = await import('./investment-cases/[id]/catalysts/route');
      const { POST: postCriterion } = await import('./investment-cases/[id]/invalidation-criteria/route');

      loginAs(userB);

      const assumptionRes = await postAssumption(
        jsonRequest(`/api/investment-cases/${investmentCase.id}/assumptions`, 'POST', {
          metric: 'REVENUE_GROWTH',
          value: 0.1,
          unit: 'percent',
          asOfDate: new Date().toISOString(),
          source: 'test',
        }),
        { params: { id: investmentCase.id } },
      );
      expect(assumptionRes.status).toBe(404);

      const evidenceRes = await postEvidence(
        jsonRequest(`/api/investment-cases/${investmentCase.id}/evidence`, 'POST', {
          claim: 'x', evidence: 'y', date: new Date().toISOString(), category: 'Growth',
          direction: 'SUPPORTS', strength: 'HIGH', sourceType: 'FINANCIAL_STATEMENT', sourceLabel: 'Fundamentals',
        }),
        { params: { id: investmentCase.id } },
      );
      expect(evidenceRes.status).toBe(404);

      const riskRes = await postRisk(
        jsonRequest(`/api/investment-cases/${investmentCase.id}/risks`, 'POST', { risk: 'x', impact: 'HIGH' }),
        { params: { id: investmentCase.id } },
      );
      expect(riskRes.status).toBe(404);

      const catalystRes = await postCatalyst(
        jsonRequest(`/api/investment-cases/${investmentCase.id}/catalysts`, 'POST', { catalyst: 'x', timeframe: 'Q1', potentialImpact: 'HIGH' }),
        { params: { id: investmentCase.id } },
      );
      expect(catalystRes.status).toBe(404);

      const criterionRes = await postCriterion(
        jsonRequest(`/api/investment-cases/${investmentCase.id}/invalidation-criteria`, 'POST', { description: 'x' }),
        { params: { id: investmentCase.id } },
      );
      expect(criterionRes.status).toBe(404);

      const [assumptions, evidence, risks, catalysts, criteria] = await Promise.all([
        db.investmentCaseAssumption.findMany({ where: { investmentCaseId: investmentCase.id } }),
        db.investmentCaseEvidence.findMany({ where: { investmentCaseId: investmentCase.id } }),
        db.investmentCaseRisk.findMany({ where: { investmentCaseId: investmentCase.id } }),
        db.investmentCaseCatalyst.findMany({ where: { investmentCaseId: investmentCase.id } }),
        db.investmentCaseInvalidationCriterion.findMany({ where: { investmentCaseId: investmentCase.id } }),
      ]);
      expect(assumptions).toHaveLength(0);
      expect(evidence).toHaveLength(0);
      expect(risks).toHaveLength(0);
      expect(catalysts).toHaveLength(0);
      expect(criteria).toHaveLength(0);
    });

    it("User B gets 404 starting a review, creating a version, or generating a memo for User A's case", async () => {
      const userA = await makeUser('icase-flow-a');
      const userB = await makeUser('icase-flow-b');
      const investmentCase = await makeCase(userA.id);

      const { POST: postReview } = await import('./investment-cases/[id]/reviews/route');
      const { POST: postVersion } = await import('./investment-cases/[id]/versions/route');
      const { POST: postMemo } = await import('./investment-cases/[id]/memo/route');
      const { POST: postAssistant } = await import('./investment-cases/[id]/assistant/route');
      const { GET: getChallenges } = await import('./investment-cases/[id]/challenges/route');

      loginAs(userB);

      const reviewRes = await postReview(jsonRequest(`/api/investment-cases/${investmentCase.id}/reviews`, 'POST', { type: 'AD_HOC' }), { params: { id: investmentCase.id } });
      expect(reviewRes.status).toBe(404);

      const versionRes = await postVersion(jsonRequest(`/api/investment-cases/${investmentCase.id}/versions`, 'POST'), { params: { id: investmentCase.id } });
      expect(versionRes.status).toBe(404);

      const memoRes = await postMemo(jsonRequest(`/api/investment-cases/${investmentCase.id}/memo`, 'POST'), { params: { id: investmentCase.id } });
      expect(memoRes.status).toBe(404);

      const assistantRes = await postAssistant(jsonRequest(`/api/investment-cases/${investmentCase.id}/assistant`, 'POST', { question: 'What is the thesis?' }), { params: { id: investmentCase.id } });
      expect(assistantRes.status).toBe(404);

      const challengesRes = await getChallenges(jsonRequest(`/api/investment-cases/${investmentCase.id}/challenges`, 'GET'), { params: { id: investmentCase.id } });
      expect(challengesRes.status).toBe(404);

      const [reviews, versions, memos] = await Promise.all([
        db.investmentCaseReview.findMany({ where: { investmentCaseId: investmentCase.id } }),
        db.investmentCaseVersion.findMany({ where: { investmentCaseId: investmentCase.id } }),
        db.investmentMemo.findMany({ where: { investmentCaseId: investmentCase.id } }),
      ]);
      expect(reviews).toHaveLength(0);
      expect(versions).toHaveLength(0);
      expect(memos).toHaveLength(0);
    });
  });

  // Milestone 14's ResearchIntegrityIssue/ResearchClaim/ModelAudit/
  // IntegritySnapshot/AuditLogEntry are deliberately GLOBAL, company-scoped
  // records (see integritySnapshotService.ts's own header comment) - not
  // per-user-owned like watchlists/portfolios/investment cases above. So
  // "cross-user" here does not mean data isolation between two users' own
  // private records (there is no such boundary by design); it means proving
  // the routes still enforce authentication, and that write actions
  // (acknowledge/resolve/ignore) correctly attribute the ACTING user for
  // accountability rather than silently omitting or misattributing it.
  describe('research integrity (Milestone 14)', () => {
    async function makeCompanyAndIssue() {
      const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Cross User Co.' }, update: {} });
      const issue = await db.researchIntegrityIssue.create({
        data: {
          companyId: company.id,
          category: 'DATA_FRESHNESS',
          severity: 'MEDIUM',
          description: 'Test issue for cross-user auth checks.',
          source: 'test',
          dedupeKey: `cross-user-test-${Date.now()}-${Math.random()}`,
        },
      });
      return { company, issue };
    }

    it('GET routes are company-scoped research data and stay public (matching thesis-monitor/timeline), while the write actions require auth and reject an unauthenticated caller with 401', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      const { company, issue } = await makeCompanyAndIssue();

      const { GET: getDashboard } = await import('./integrity/route');
      expect((await getDashboard()).status).toBe(200);

      const { GET: getSnapshot } = await import('./integrity/[ticker]/route');
      expect((await getSnapshot(jsonRequest(`/api/integrity/${company.ticker}`, 'GET'), { params: { ticker: company.ticker } })).status).toBe(200);

      const { GET: getIssues } = await import('./integrity/[ticker]/issues/route');
      expect((await getIssues(jsonRequest(`/api/integrity/${company.ticker}/issues`, 'GET'), { params: { ticker: company.ticker } })).status).toBe(200);

      const { GET: getClaims } = await import('./integrity/[ticker]/claims/route');
      expect((await getClaims(jsonRequest(`/api/integrity/${company.ticker}/claims`, 'GET'), { params: { ticker: company.ticker } })).status).toBe(200);

      const { GET: getAuditLog } = await import('./integrity/[ticker]/audit-log/route');
      expect((await getAuditLog(jsonRequest(`/api/integrity/${company.ticker}/audit-log`, 'GET'), { params: { ticker: company.ticker } })).status).toBe(200);

      const { POST: postAcknowledge } = await import('./integrity/issues/[id]/acknowledge/route');
      expect((await postAcknowledge(jsonRequest(`/api/integrity/issues/${issue.id}/acknowledge`, 'POST'), { params: { id: issue.id } })).status).toBe(401);

      const { POST: postResolve } = await import('./integrity/issues/[id]/resolve/route');
      expect((await postResolve(jsonRequest(`/api/integrity/issues/${issue.id}/resolve`, 'POST', { resolution: 'Fixed.' }), { params: { id: issue.id } })).status).toBe(401);

      const { POST: postIgnore } = await import('./integrity/issues/[id]/ignore/route');
      expect((await postIgnore(jsonRequest(`/api/integrity/issues/${issue.id}/ignore`, 'POST', { reason: 'Not applicable.' }), { params: { id: issue.id } })).status).toBe(401);

      // Untouched by the rejected calls above - proving the 401s were real
      // blocks, not coincidental no-ops.
      const stillOpen = await db.researchIntegrityIssue.findUnique({ where: { id: issue.id } });
      expect(stillOpen?.status).toBe('OPEN');
    });

    it("acknowledging an issue records the acting user's id, not silently omitted", async () => {
      const actor = await makeUser('integrity-ack');
      const { issue } = await makeCompanyAndIssue();

      const { POST } = await import('./integrity/issues/[id]/acknowledge/route');
      loginAs(actor);
      const res = await POST(jsonRequest(`/api/integrity/issues/${issue.id}/acknowledge`, 'POST'), { params: { id: issue.id } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ACKNOWLEDGED');
      expect(body.acknowledgedByUserId).toBe(actor.id);
    });

    it("resolving an issue records the acting user's id and the resolution text, and requires a non-empty resolution", async () => {
      const actor = await makeUser('integrity-resolve');
      const { issue } = await makeCompanyAndIssue();

      const { POST } = await import('./integrity/issues/[id]/resolve/route');
      loginAs(actor);

      const missingBodyRes = await POST(jsonRequest(`/api/integrity/issues/${issue.id}/resolve`, 'POST', {}), { params: { id: issue.id } });
      expect(missingBodyRes.status).toBe(400);

      const res = await POST(jsonRequest(`/api/integrity/issues/${issue.id}/resolve`, 'POST', { resolution: 'Data refreshed and reconciled manually.' }), { params: { id: issue.id } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('RESOLVED');
      expect(body.resolvedByUserId).toBe(actor.id);
      expect(body.resolution).toBe('Data refreshed and reconciled manually.');
    });

    it("ignoring an issue records the acting user's id and the ignore reason, and requires a non-empty reason (spec section 21)", async () => {
      const actor = await makeUser('integrity-ignore');
      const { issue } = await makeCompanyAndIssue();

      const { POST } = await import('./integrity/issues/[id]/ignore/route');
      loginAs(actor);

      const missingReasonRes = await POST(jsonRequest(`/api/integrity/issues/${issue.id}/ignore`, 'POST', {}), { params: { id: issue.id } });
      expect(missingReasonRes.status).toBe(400);

      const res = await POST(jsonRequest(`/api/integrity/issues/${issue.id}/ignore`, 'POST', { reason: 'False positive - vendor confirmed data is correct.' }), { params: { id: issue.id } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('IGNORED');
      expect(body.resolvedByUserId).toBe(actor.id);
      expect(body.ignoreReason).toBe('False positive - vendor confirmed data is correct.');
    });

    it('acknowledging, resolving, or ignoring a non-existent issue id returns 404, not a crash', async () => {
      const actor = await makeUser('integrity-missing');
      loginAs(actor);

      const { POST: postAcknowledge } = await import('./integrity/issues/[id]/acknowledge/route');
      expect((await postAcknowledge(jsonRequest('/api/integrity/issues/does-not-exist/acknowledge', 'POST'), { params: { id: 'does-not-exist' } })).status).toBe(404);

      const { POST: postResolve } = await import('./integrity/issues/[id]/resolve/route');
      expect((await postResolve(jsonRequest('/api/integrity/issues/does-not-exist/resolve', 'POST', { resolution: 'x' }), { params: { id: 'does-not-exist' } })).status).toBe(404);

      const { POST: postIgnore } = await import('./integrity/issues/[id]/ignore/route');
      expect((await postIgnore(jsonRequest('/api/integrity/issues/does-not-exist/ignore', 'POST', { reason: 'x' }), { params: { id: 'does-not-exist' } })).status).toBe(404);
    });

    it('GET /api/integrity/[ticker] returns 404 for a ticker Atlas has never seen, never silently creating one', async () => {
      const actor = await makeUser('integrity-unknown-ticker');
      loginAs(actor);

      const { GET } = await import('./integrity/[ticker]/route');
      const res = await GET(jsonRequest('/api/integrity/ZZZNOTREAL', 'GET'), { params: { ticker: 'ZZZNOTREAL' } });
      expect(res.status).toBe(404);
    });
  });

  // Milestone 15's explicit security requirement (spec section 28): a user
  // in one workspace must never access another workspace's projects, tasks,
  // notes, comments, reviews, or meetings; VIEWER must never approve
  // reports, edit research, or manage members; ANALYST must never manage
  // workspace members. Every check here goes through the real route
  // handlers (User -> Workspace Membership -> Role -> Resource Permission,
  // per spec section 26), not the service layer directly.
  describe('workspace (Milestone 15)', () => {
    async function makeWorkspace(ownerId: string, name: string) {
      const { createWorkspace } = await import('@/lib/services/workspaceService');
      return createWorkspace(ownerId, { name });
    }

    async function addMember(workspaceId: string, ownerId: string, email: string, role: 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER') {
      const { addWorkspaceMember } = await import('@/lib/services/workspaceService');
      return addWorkspaceMember(ownerId, workspaceId, { email, role });
    }

    it('an unauthenticated request is rejected with 401, not silently allowed', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET: listWorkspaces } = await import('./workspace/route');
      expect((await listWorkspaces()).status).toBe(401);

      const owner = await makeUser('unauth-owner');
      const workspace = await makeWorkspace(owner.id, 'Unauth Test WS');

      const { POST: postTask } = await import('./workspace/[id]/tasks/route');
      const res = await postTask(jsonRequest(`/api/workspace/${workspace.id}/tasks`, 'POST', { title: 'x' }), { params: { id: workspace.id } });
      expect(res.status).toBe(401);
    });

    it("a non-member gets 404 reading a workspace and its projects/tasks/notes/meetings/reviews lists — never leaking whether the workspace exists", async () => {
      const owner = await makeUser('nonmember-owner');
      const outsider = await makeUser('nonmember-outsider');
      const workspace = await makeWorkspace(owner.id, 'Non-Member Test WS');

      loginAs(outsider);

      const { GET: getWorkspace } = await import('./workspace/[id]/route');
      expect((await getWorkspace(jsonRequest(`/api/workspace/${workspace.id}`, 'GET'), { params: { id: workspace.id } })).status).toBe(404);

      const { GET: listProjects } = await import('./workspace/[id]/projects/route');
      expect((await listProjects(jsonRequest(`/api/workspace/${workspace.id}/projects`, 'GET'), { params: { id: workspace.id } })).status).toBe(404);

      const { GET: listTasks } = await import('./workspace/[id]/tasks/route');
      expect((await listTasks(jsonRequest(`/api/workspace/${workspace.id}/tasks`, 'GET'), { params: { id: workspace.id } })).status).toBe(404);

      const { GET: listNotes } = await import('./workspace/[id]/notes/route');
      expect((await listNotes(jsonRequest(`/api/workspace/${workspace.id}/notes`, 'GET'), { params: { id: workspace.id } })).status).toBe(404);

      const { GET: listMeetings } = await import('./workspace/[id]/meetings/route');
      expect((await listMeetings(jsonRequest(`/api/workspace/${workspace.id}/meetings`, 'GET'), { params: { id: workspace.id } })).status).toBe(404);

      const { GET: listReviews } = await import('./workspace/[id]/reviews/route');
      expect((await listReviews(jsonRequest(`/api/workspace/${workspace.id}/reviews`, 'GET'), { params: { id: workspace.id } })).status).toBe(404);
    });

    it("a resource created in Workspace A 404s when fetched through Workspace B's own route, even for Workspace B's owner", async () => {
      const ownerA = await makeUser('cross-a-owner');
      const ownerB = await makeUser('cross-b-owner');
      const workspaceA = await makeWorkspace(ownerA.id, 'Cross A');
      const workspaceB = await makeWorkspace(ownerB.id, 'Cross B');

      loginAs(ownerA);
      const { POST: postProject } = await import('./workspace/[id]/projects/route');
      const projectRes = await postProject(jsonRequest(`/api/workspace/${workspaceA.id}/projects`, 'POST', { name: 'A Project' }), { params: { id: workspaceA.id } });
      const project = await projectRes.json();

      const { POST: postTask } = await import('./workspace/[id]/tasks/route');
      const taskRes = await postTask(jsonRequest(`/api/workspace/${workspaceA.id}/tasks`, 'POST', { title: 'A task' }), { params: { id: workspaceA.id } });
      const task = await taskRes.json();

      const { POST: postNote } = await import('./workspace/[id]/notes/route');
      const noteRes = await postNote(jsonRequest(`/api/workspace/${workspaceA.id}/notes`, 'POST', { title: 'A note', content: 'Content.' }), { params: { id: workspaceA.id } });
      const note = await noteRes.json();

      const { POST: postMeeting } = await import('./workspace/[id]/meetings/route');
      const meetingRes = await postMeeting(jsonRequest(`/api/workspace/${workspaceA.id}/meetings`, 'POST', { title: 'A meeting', date: new Date().toISOString() }), { params: { id: workspaceA.id } });
      const meeting = await meetingRes.json();

      loginAs(ownerB);

      const { GET: getProject } = await import('./workspace/[id]/projects/[projectId]/route');
      expect((await getProject(jsonRequest(`/api/workspace/${workspaceB.id}/projects/${project.id}`, 'GET'), { params: { id: workspaceB.id, projectId: project.id } })).status).toBe(404);

      const { GET: getTask } = await import('./workspace/[id]/tasks/[taskId]/route');
      expect((await getTask(jsonRequest(`/api/workspace/${workspaceB.id}/tasks/${task.id}`, 'GET'), { params: { id: workspaceB.id, taskId: task.id } })).status).toBe(404);

      const { GET: getNote } = await import('./workspace/[id]/notes/[noteId]/route');
      expect((await getNote(jsonRequest(`/api/workspace/${workspaceB.id}/notes/${note.id}`, 'GET'), { params: { id: workspaceB.id, noteId: note.id } })).status).toBe(404);

      const { GET: getMeeting } = await import('./workspace/[id]/meetings/[meetingId]/route');
      expect((await getMeeting(jsonRequest(`/api/workspace/${workspaceB.id}/meetings/${meeting.id}`, 'GET'), { params: { id: workspaceB.id, meetingId: meeting.id } })).status).toBe(404);

      // B's owner never even had membership in A, so a direct fetch through
      // A's own id also 404s (not a workspace member of A).
      expect((await getTask(jsonRequest(`/api/workspace/${workspaceA.id}/tasks/${task.id}`, 'GET'), { params: { id: workspaceA.id, taskId: task.id } })).status).toBe(404);
    });

    it("a comment on Workspace A's note is invisible through Workspace B's comment list", async () => {
      const ownerA = await makeUser('comment-a-owner');
      const ownerB = await makeUser('comment-b-owner');
      const workspaceA = await makeWorkspace(ownerA.id, 'Comment Cross A');
      const workspaceB = await makeWorkspace(ownerB.id, 'Comment Cross B');

      loginAs(ownerA);
      const { POST: postNote } = await import('./workspace/[id]/notes/route');
      const noteRes = await postNote(jsonRequest(`/api/workspace/${workspaceA.id}/notes`, 'POST', { title: 'A note', content: 'Content.' }), { params: { id: workspaceA.id } });
      const note = await noteRes.json();

      const { POST: postComment } = await import('./workspace/[id]/comments/route');
      await postComment(jsonRequest(`/api/workspace/${workspaceA.id}/comments`, 'POST', { parentType: 'RESEARCH_NOTE', parentId: note.id, content: 'A comment.' }), { params: { id: workspaceA.id } });

      loginAs(ownerB);
      const { GET: listComments } = await import('./workspace/[id]/comments/route');
      const res = await listComments(jsonRequest(`/api/workspace/${workspaceB.id}/comments?parentType=RESEARCH_NOTE&parentId=${note.id}`, 'GET'), { params: { id: workspaceB.id } });
      // Comments are stored scoped to their own workspaceId, so a query
      // through a DIFFERENT workspace's id can never return them - even
      // though the request itself succeeds (workspaceB's owner is a real
      // member of workspaceB), the result set is empty, never leaking A's data.
      expect(res.status).toBe(200);
      const comments = await res.json();
      expect(comments).toEqual([]);
    });

    it('VIEWER cannot create a task, create a note, or manage members', async () => {
      const owner = await makeUser('viewer-owner');
      const viewer = await makeUser('viewer-viewer');
      const workspace = await makeWorkspace(owner.id, 'Viewer Prohibitions Test');
      await addMember(workspace.id, owner.id, viewer.email, 'VIEWER');

      loginAs(viewer);

      const { POST: postTask } = await import('./workspace/[id]/tasks/route');
      expect((await postTask(jsonRequest(`/api/workspace/${workspace.id}/tasks`, 'POST', { title: 'Should fail' }), { params: { id: workspace.id } })).status).toBe(403);

      const { POST: postNote } = await import('./workspace/[id]/notes/route');
      expect((await postNote(jsonRequest(`/api/workspace/${workspace.id}/notes`, 'POST', { title: 'x', content: 'y' }), { params: { id: workspace.id } })).status).toBe(403);

      const { POST: postMember } = await import('./workspace/[id]/members/route');
      const another = await makeUser('viewer-target');
      expect((await postMember(jsonRequest(`/api/workspace/${workspace.id}/members`, 'POST', { email: another.email }), { params: { id: workspace.id } })).status).toBe(403);
    });

    it('VIEWER cannot approve a report even with a fully-checked, non-existent review id (permission checked before existence)', async () => {
      const owner = await makeUser('viewer-approve-owner');
      const viewer = await makeUser('viewer-approve-viewer');
      const workspace = await makeWorkspace(owner.id, 'Viewer Approve Test');
      await addMember(workspace.id, owner.id, viewer.email, 'VIEWER');

      loginAs(viewer);
      const { POST: approve } = await import('./workspace/[id]/reviews/[reviewId]/approve/route');
      const res = await approve(jsonRequest(`/api/workspace/${workspace.id}/reviews/does-not-exist/approve`, 'POST'), { params: { id: workspace.id, reviewId: 'does-not-exist' } });
      expect(res.status).toBe(403);
    });

    it('ANALYST cannot add, change the role of, or remove a workspace member', async () => {
      const owner = await makeUser('analyst-owner');
      const analyst = await makeUser('analyst-analyst');
      const target = await makeUser('analyst-target');
      const workspace = await makeWorkspace(owner.id, 'Analyst Prohibitions Test');
      await addMember(workspace.id, owner.id, analyst.email, 'ANALYST');
      await addMember(workspace.id, owner.id, target.email, 'VIEWER');

      loginAs(analyst);

      const { POST: postMember } = await import('./workspace/[id]/members/route');
      const another = await makeUser('analyst-newcomer');
      expect((await postMember(jsonRequest(`/api/workspace/${workspace.id}/members`, 'POST', { email: another.email }), { params: { id: workspace.id } })).status).toBe(403);

      const { PATCH: patchMember, DELETE: deleteMember } = await import('./workspace/[id]/members/[userId]/route');
      expect((await patchMember(jsonRequest(`/api/workspace/${workspace.id}/members/${target.id}`, 'PATCH', { role: 'ADMIN' }), { params: { id: workspace.id, userId: target.id } })).status).toBe(403);
      expect((await deleteMember(jsonRequest(`/api/workspace/${workspace.id}/members/${target.id}`, 'DELETE'), { params: { id: workspace.id, userId: target.id } })).status).toBe(403);
    });

    it('OWNER/ADMIN can add and remove members; the full round trip works through the real route handlers', async () => {
      const owner = await makeUser('owner-crud-owner');
      const newcomer = await makeUser('owner-crud-newcomer');
      const workspace = await makeWorkspace(owner.id, 'Owner CRUD Test');

      loginAs(owner);
      const { POST: postMember } = await import('./workspace/[id]/members/route');
      const addRes = await postMember(jsonRequest(`/api/workspace/${workspace.id}/members`, 'POST', { email: newcomer.email, role: 'ANALYST' }), { params: { id: workspace.id } });
      expect(addRes.status).toBe(201);

      const { DELETE: deleteMember } = await import('./workspace/[id]/members/[userId]/route');
      const removeRes = await deleteMember(jsonRequest(`/api/workspace/${workspace.id}/members/${newcomer.id}`, 'DELETE'), { params: { id: workspace.id, userId: newcomer.id } });
      expect(removeRes.status).toBe(200);
    });
  });
});
