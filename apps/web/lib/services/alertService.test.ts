import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

/**
 * Integration test against the real local Postgres for ownership + scoping
 * (getFollowedCompanies runs for real); listFilings/listEarningsCalls/
 * listReports are mocked so evaluation never makes real network calls.
 */

vi.mock('@/lib/services/secFilingService', () => ({ listFilings: vi.fn() }));
vi.mock('@/lib/services/earningsCallService', () => ({ listEarningsCalls: vi.fn() }));
vi.mock('@/lib/services/researchReportService', () => ({ listReports: vi.fn() }));
vi.mock('@/lib/services/researchEventFeedService', () => ({ getCompanyTimeline: vi.fn() }));

import { listFilings } from '@/lib/services/secFilingService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { listReports } from '@/lib/services/researchReportService';
import { getCompanyTimeline } from '@/lib/services/researchEventFeedService';
import { createInvestmentCase } from '@/lib/services/investmentCaseService';
import { setAssumption } from '@/lib/services/investmentCaseAssumptionService';
import {
  AlertNotFoundError,
  createAlert,
  deleteAlert,
  evaluateAlerts,
  InvalidAlertInputError,
  listAlerts,
  setAlertActive,
} from './alertService';

const TEST_EMAIL = 'zz-alert-test@example.com';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function makeFollowedCompany(userId: string, ticker: string) {
  const company = await db.company.upsert({ where: { ticker }, create: { ticker, name: `${ticker} Inc.` }, update: {} });
  const watchlist = await db.watchlist.create({ data: { userId, name: `Watch-${ticker}-${userId.slice(0, 6)}` } });
  await db.watchlistCompany.create({ data: { watchlistId: watchlist.id, companyId: company.id, orderIndex: 0 } });
  return company;
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: { in: ['ZZALERT1', 'ZZALERT2'] } } });
}

describe('alertService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(() => {
    vi.mocked(listFilings).mockReset();
    vi.mocked(listEarningsCalls).mockReset();
    vi.mocked(listReports).mockReset();
    vi.mocked(getCompanyTimeline).mockReset();
  });

  it('creates, lists, toggles, and deletes an alert', async () => {
    const user = await makeUser('crud');
    const alert = await createAlert(user.id, { type: 'NEW_SEC_FILING' });
    expect(alert.userId).toBe(user.id);
    expect(alert.isActive).toBe(true);

    expect(await listAlerts(user.id)).toHaveLength(1);

    const toggled = await setAlertActive(user.id, alert.id, false);
    expect(toggled.isActive).toBe(false);

    await deleteAlert(user.id, alert.id);
    expect(await listAlerts(user.id)).toHaveLength(0);
  });

  it('applies a default threshold for DCF_VALUATION_CHANGE when none is given', async () => {
    const user = await makeUser('default-threshold');
    const alert = await createAlert(user.id, { type: 'DCF_VALUATION_CHANGE' });
    expect(alert.thresholdPercent).toBe(10);
  });

  it('rejects a non-positive threshold', async () => {
    const user = await makeUser('bad-threshold');
    await expect(createAlert(user.id, { type: 'DCF_VALUATION_CHANGE', thresholdPercent: -5 })).rejects.toBeInstanceOf(InvalidAlertInputError);
  });

  it('triggers a NEW_SEC_FILING alert when a followed company has a recent filing', async () => {
    const user = await makeUser('filing-trigger');
    await makeFollowedCompany(user.id, 'ZZALERT1');
    vi.mocked(listFilings).mockResolvedValue([{ id: 'f1', formType: '10-Q', filingDate: new Date() } as never]);

    await createAlert(user.id, { type: 'NEW_SEC_FILING' });
    const [evaluated] = await evaluateAlerts(user.id);

    expect(evaluated?.lastTriggeredAt).not.toBeNull();
    expect(evaluated?.lastTriggeredSummary).toContain('ZZALERT1');
    expect(evaluated?.lastCheckedAt).not.toBeNull();
  });

  it('does not trigger when the filing is old', async () => {
    const user = await makeUser('filing-no-trigger');
    await makeFollowedCompany(user.id, 'ZZALERT1');
    vi.mocked(listFilings).mockResolvedValue([{ id: 'f1', formType: '10-Q', filingDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } as never]);

    await createAlert(user.id, { type: 'NEW_SEC_FILING' });
    const [evaluated] = await evaluateAlerts(user.id);

    expect(evaluated?.lastTriggeredAt).toBeNull();
    expect(evaluated?.lastCheckedAt).not.toBeNull();
  });

  it('never evaluates an inactive alert', async () => {
    const user = await makeUser('inactive');
    await makeFollowedCompany(user.id, 'ZZALERT1');
    vi.mocked(listFilings).mockResolvedValue([{ id: 'f1', formType: '10-Q', filingDate: new Date() } as never]);

    const alert = await createAlert(user.id, { type: 'NEW_SEC_FILING' });
    await setAlertActive(user.id, alert.id, false);

    const [evaluated] = await evaluateAlerts(user.id);
    expect(evaluated?.lastCheckedAt).toBeNull();
    expect(listFilings).not.toHaveBeenCalled();
  });

  it('scopes evaluation to only the alert-specified company when one is set', async () => {
    const user = await makeUser('scoped');
    const scoped = await makeFollowedCompany(user.id, 'ZZALERT1');
    await makeFollowedCompany(user.id, 'ZZALERT2');

    vi.mocked(listFilings).mockImplementation(async (ticker: string) => {
      // Only ZZALERT2 has a recent filing — the alert is scoped to ZZALERT1, so it must NOT trigger.
      if (ticker === 'ZZALERT2') return [{ id: 'f2', formType: '8-K', filingDate: new Date() } as never];
      return [];
    });

    await createAlert(user.id, { type: 'NEW_SEC_FILING', companyId: scoped.id });
    const [evaluated] = await evaluateAlerts(user.id);
    expect(evaluated?.lastTriggeredAt).toBeNull();
  });

  it('prevents User B from toggling or deleting User A alert', async () => {
    const userA = await makeUser('secure-a');
    const userB = await makeUser('secure-b');
    const alert = await createAlert(userA.id, { type: 'NEW_SEC_FILING' });

    await expect(setAlertActive(userB.id, alert.id, false)).rejects.toBeInstanceOf(AlertNotFoundError);
    await expect(deleteAlert(userB.id, alert.id)).rejects.toBeInstanceOf(AlertNotFoundError);

    const stillThere = await listAlerts(userA.id);
    expect(stillThere.find((a) => a.id === alert.id)?.isActive).toBe(true);
  });

  it("evaluateAlerts never evaluates against another user's followed companies", async () => {
    const userA = await makeUser('cross-a');
    const userB = await makeUser('cross-b');
    // userB follows a company with a fresh filing, userA follows nothing.
    await makeFollowedCompany(userB.id, 'ZZALERT1');
    vi.mocked(listFilings).mockResolvedValue([{ id: 'f1', formType: '10-Q', filingDate: new Date() } as never]);

    await createAlert(userA.id, { type: 'NEW_SEC_FILING' });
    const [evaluated] = await evaluateAlerts(userA.id);
    expect(evaluated?.lastTriggeredAt).toBeNull();
  });

  it('triggers HIGH_IMPORTANCE_RESEARCH_EVENT for a recent HIGH-materiality event but not a MEDIUM one', async () => {
    const user = await makeUser('high-importance');
    await makeFollowedCompany(user.id, 'ZZALERT1');
    vi.mocked(getCompanyTimeline).mockResolvedValue([
      { id: 'e1', category: 'EARNINGS', type: 'GUIDANCE_CHANGE', title: 'Guidance lowered', description: 'x', materiality: 'MEDIUM', confidence: 'HIGH', eventDate: new Date().toISOString() },
    ]);

    await createAlert(user.id, { type: 'HIGH_IMPORTANCE_RESEARCH_EVENT' });
    const [notTriggered] = await evaluateAlerts(user.id);
    expect(notTriggered?.lastTriggeredAt).toBeNull();

    vi.mocked(getCompanyTimeline).mockResolvedValue([
      { id: 'e2', category: 'VALUATION', type: 'DCF_VALUATION_CHANGE', title: 'DCF valuation changed', description: 'x', materiality: 'HIGH', confidence: 'HIGH', eventDate: new Date().toISOString() },
    ]);
    const [triggered] = await evaluateAlerts(user.id);
    expect(triggered?.lastTriggeredAt).not.toBeNull();
    expect(triggered?.lastTriggeredSummary).toContain('ZZALERT1');
  });

  it('triggers CRITICAL_RESEARCH_EVENT only for CRITICAL materiality, not HIGH', async () => {
    const user = await makeUser('critical');
    await makeFollowedCompany(user.id, 'ZZALERT1');
    vi.mocked(getCompanyTimeline).mockResolvedValue([
      { id: 'e1', category: 'CORPORATE_EVENT', type: 'CORPORATE_EVENT', title: 'Major event', description: 'x', materiality: 'HIGH', confidence: 'HIGH', eventDate: new Date().toISOString() },
    ]);

    await createAlert(user.id, { type: 'CRITICAL_RESEARCH_EVENT' });
    const [notTriggered] = await evaluateAlerts(user.id);
    expect(notTriggered?.lastTriggeredAt).toBeNull();

    vi.mocked(getCompanyTimeline).mockResolvedValue([
      { id: 'e2', category: 'CORPORATE_EVENT', type: 'CORPORATE_EVENT', title: 'Bankruptcy filing', description: 'x', materiality: 'CRITICAL', confidence: 'HIGH', eventDate: new Date().toISOString() },
    ]);
    const [triggered] = await evaluateAlerts(user.id);
    expect(triggered?.lastTriggeredSummary).toContain('CRITICAL');
  });

  it('triggers NEW_MATERIAL_RISK for a NEW_RISK event and surfaces its description', async () => {
    const user = await makeUser('new-risk');
    await makeFollowedCompany(user.id, 'ZZALERT1');
    vi.mocked(getCompanyTimeline).mockResolvedValue([
      { id: 'e1', category: 'SEC_FILING', type: 'NEW_RISK', title: 'New risk disclosed', description: 'A new supply-chain risk was disclosed.', materiality: 'MEDIUM', confidence: 'MEDIUM', eventDate: new Date().toISOString() },
    ]);

    await createAlert(user.id, { type: 'NEW_MATERIAL_RISK' });
    const [triggered] = await evaluateAlerts(user.id);
    expect(triggered?.lastTriggeredSummary).toContain('supply-chain');
  });

  it('does not trigger a research-event alert when the event is outside the recency window', async () => {
    const user = await makeUser('stale-event');
    await makeFollowedCompany(user.id, 'ZZALERT1');
    vi.mocked(getCompanyTimeline).mockResolvedValue([
      { id: 'e1', category: 'VALUATION', type: 'DCF_VALUATION_CHANGE', title: 'DCF valuation changed', description: 'x', materiality: 'HIGH', confidence: 'HIGH', eventDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() },
    ]);

    await createAlert(user.id, { type: 'HIGH_IMPORTANCE_RESEARCH_EVENT' });
    const [evaluated] = await evaluateAlerts(user.id);
    expect(evaluated?.lastTriggeredAt).toBeNull();
  });

  describe('Milestone 14 — integrity alert types', () => {
    it('triggers CRITICAL_INTEGRITY_ISSUE only for a CRITICAL-severity open issue', async () => {
      const user = await makeUser('critical-integrity');
      const company = await makeFollowedCompany(user.id, 'ZZALERT1');
      await db.researchIntegrityIssue.create({
        data: { companyId: company.id, category: 'FINANCIAL_RECONCILIATION', severity: 'HIGH', description: 'A high-severity mismatch.', source: 'test', dedupeKey: 'test:high' },
      });

      await createAlert(user.id, { type: 'CRITICAL_INTEGRITY_ISSUE' });
      const [notTriggered] = await evaluateAlerts(user.id);
      expect(notTriggered?.lastTriggeredAt).toBeNull();

      await db.researchIntegrityIssue.create({
        data: { companyId: company.id, category: 'DCF_MODEL_ERROR', severity: 'CRITICAL', description: 'Terminal growth exceeds WACC.', source: 'test', dedupeKey: 'test:critical' },
      });
      const [triggered] = await evaluateAlerts(user.id);
      expect(triggered?.lastTriggeredSummary).toContain('CRITICAL');

      await db.researchIntegrityIssue.deleteMany({ where: { companyId: company.id } });
    });

    it('triggers RESEARCH_DATA_MISMATCH for a HIGH/CRITICAL data-discrepancy-style issue', async () => {
      const user = await makeUser('data-mismatch');
      const company = await makeFollowedCompany(user.id, 'ZZALERT1');
      await db.researchIntegrityIssue.create({
        data: { companyId: company.id, category: 'FINANCIAL_RECONCILIATION', severity: 'HIGH', description: 'Balance sheet does not reconcile.', source: 'test', dedupeKey: 'test:mismatch' },
      });

      await createAlert(user.id, { type: 'RESEARCH_DATA_MISMATCH' });
      const [triggered] = await evaluateAlerts(user.id);
      expect(triggered?.lastTriggeredSummary).toContain('reconcile');

      await db.researchIntegrityIssue.deleteMany({ where: { companyId: company.id } });
    });

    it('triggers DCF_MODEL_ERROR for a DCF_MODEL_ERROR-category issue and not for a COMPS_MODEL_ERROR one', async () => {
      const user = await makeUser('dcf-error');
      const company = await makeFollowedCompany(user.id, 'ZZALERT1');
      await db.researchIntegrityIssue.create({
        data: { companyId: company.id, category: 'COMPS_MODEL_ERROR', severity: 'HIGH', description: 'A comps issue.', source: 'test', dedupeKey: 'test:comps' },
      });

      await createAlert(user.id, { type: 'DCF_MODEL_ERROR' });
      const [notTriggered] = await evaluateAlerts(user.id);
      expect(notTriggered?.lastTriggeredAt).toBeNull();

      await db.researchIntegrityIssue.create({
        data: { companyId: company.id, category: 'DCF_MODEL_ERROR', severity: 'CRITICAL', description: 'CRITICAL MODEL ERROR: terminal growth >= WACC.', source: 'test', dedupeKey: 'test:dcf' },
      });
      const [triggered] = await evaluateAlerts(user.id);
      expect(triggered?.lastTriggeredSummary).toContain('MODEL ERROR');

      await db.researchIntegrityIssue.deleteMany({ where: { companyId: company.id } });
    });

    it("triggers THESIS_ASSUMPTION_CONFLICT only for the alert-owning user's own investment case", async () => {
      const user = await makeUser('thesis-conflict');
      const otherUser = await makeUser('thesis-conflict-other');
      const company = await makeFollowedCompany(user.id, 'ZZALERT1');
      await db.financialPeriod.create({
        data: { companyId: company.id, fiscalYear: 2025, fiscalPeriod: 'FY', periodType: 'ANNUAL', periodEnd: new Date('2025-12-31'), incomeStatement: { create: { revenue: 10_000_000_000 } } },
      });
      const call = await db.earningsCall.create({ data: { companyId: company.id, fiscalYear: 2026, fiscalQuarter: 1, provider: 'test' } });
      await db.guidanceObservation.create({
        data: { earningsCallId: call.id, metric: 'REVENUE', metricLabel: 'Revenue', period: 'FY2026', low: 10_800_000_000, high: 11_000_000_000, midpoint: 10_900_000_000, change: 'NEW', sourceExcerpt: 'x' },
      });

      // otherUser's own case should never affect user's alert evaluation.
      const otherCase = await createInvestmentCase(otherUser.id, { ticker: 'ZZALERT1', horizon: '3-5 years', coreThesis: 'x' });
      await setAssumption(otherUser.id, otherCase.id, { metric: 'REVENUE_GROWTH', scenario: 'BASE', value: 0.15, unit: 'ratio', asOfDate: new Date(), source: 'x' });

      await createAlert(user.id, { type: 'THESIS_ASSUMPTION_CONFLICT' });
      const [noOwnCase] = await evaluateAlerts(user.id);
      expect(noOwnCase?.lastTriggeredAt).toBeNull();

      const ownCase = await createInvestmentCase(user.id, { ticker: 'ZZALERT1', horizon: '3-5 years', coreThesis: 'x' });
      await setAssumption(user.id, ownCase.id, { metric: 'REVENUE_GROWTH', scenario: 'BASE', value: 0.15, unit: 'ratio', asOfDate: new Date(), source: 'My model' });

      const [triggered] = await evaluateAlerts(user.id);
      expect(triggered?.lastTriggeredSummary).toMatch(/ASSUMPTION CONFLICT/);
    });
  });
});
