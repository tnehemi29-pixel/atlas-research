import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireUser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/requireUser')>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock('@/lib/services/valuationOverrideService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/valuationOverrideService')>();
  return { ...actual, saveCostOfDebtOverride: vi.fn(), clearCostOfDebtOverride: vi.fn() };
});
vi.mock('@/lib/services/companyService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/companyService')>();
  return { ...actual, getCompanyOverview: vi.fn() };
});
vi.mock('@/lib/services/financialDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/financialDataService')>();
  return { ...actual, getFinancials: vi.fn() };
});
vi.mock('@/lib/services/compsDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/compsDataService')>();
  return { ...actual, getPeerCandidates: vi.fn(), fetchTargetAndPeers: vi.fn() };
});
// Deliberately NOT mocking '@/lib/db' or '@/lib/services/integritySnapshotService' —
// this file exercises the real claim/lease mechanism against the isolated
// local test database, the same way integritySnapshotService.concurrency.test.ts
// does, but entered through the cost-of-debt route's PUT/DELETE handlers.

import { PUT, DELETE } from './route';
import { requireUser } from '@/lib/auth/requireUser';
import { saveCostOfDebtOverride, clearCostOfDebtOverride } from '@/lib/services/valuationOverrideService';
import { getCompanyOverview } from '@/lib/services/companyService';
import { getPeerCandidates } from '@/lib/services/compsDataService';
import { db } from '@/lib/db';
import { getCompanyIntegritySnapshot } from '@/lib/services/integritySnapshotService';

/**
 * Covers the final production concurrency bypass found during pre-commit
 * audit: refreshIntegritySnapshot() (this route's post-save/clear hook) used
 * to call computeIntegritySnapshot() directly, completely unclaimed — able
 * to race, uncoordinated, against a concurrent getCompanyIntegritySnapshot()
 * computation with last-write-wins behavior. Fixed by routing it through
 * getCompanyIntegritySnapshot(companyId, { forceRefresh: true }) instead —
 * the same already-tested claim/lease/placeholder machinery every other
 * caller uses, not a second mechanism. These tests exercise that wiring
 * end-to-end through the route's own exported PUT/DELETE handlers against
 * the real (isolated, local-only) test database — not any financial/DCF/
 * market-cap/WACC/data-quality logic, which stays fully mocked out via
 * getCompanyOverview/getPeerCandidates/fetchTargetAndPeers.
 */

const TICKER = 'ZZCOD1';

function makePutRequest(ticker: string, costOfDebtOverride: number): NextRequest {
  return new NextRequest(new URL(`/api/v1/companies/${ticker}/valuation/cost-of-debt`, 'http://localhost:3000'), {
    method: 'PUT',
    body: JSON.stringify({ costOfDebtOverride }),
  });
}

function makeDeleteRequest(ticker: string): NextRequest {
  return new NextRequest(new URL(`/api/v1/companies/${ticker}/valuation/cost-of-debt`, 'http://localhost:3000'), { method: 'DELETE' });
}

async function cleanup() {
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) {
    await db.auditLogEntry.deleteMany({ where: { companyId: company.id } });
    await db.researchIntegrityIssue.deleteMany({ where: { companyId: company.id } });
    await db.dataQualityCheck.deleteMany({ where: { companyId: company.id } });
    await db.modelAudit.deleteMany({ where: { companyId: company.id } });
    await db.integritySnapshot.deleteMany({ where: { companyId: company.id } });
  }
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('cost-of-debt route concurrency (real claim mechanism, mocked external services)', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as never);
  });
  afterEach(async () => {
    await cleanup();
    vi.mocked(saveCostOfDebtOverride).mockReset();
    vi.mocked(clearCostOfDebtOverride).mockReset();
    vi.mocked(getCompanyOverview).mockReset();
    vi.mocked(getPeerCandidates).mockReset();
  });

  it('[1] refresh with no competing computation: succeeds, produces a real (non-placeholder) snapshot', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
    vi.mocked(saveCostOfDebtOverride).mockResolvedValue(0.0578);
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const response = await PUT(makePutRequest(TICKER, 0.0578), { params: { ticker: TICKER } });

    expect(response.status).toBe(200);
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row).not.toBeNull();
    expect(Object.keys(row!.dimensions as object).length).toBeGreaterThan(0);
    expect(row!.computingSince).toBeNull();
  });

  it('[2] refresh while another integrity computation owns the claim: does not independently compute, waits, and still succeeds', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
    vi.mocked(saveCostOfDebtOverride).mockResolvedValue(0.0578);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);
    let releaseOwner: () => void = () => {};
    vi.mocked(getCompanyOverview).mockImplementation(
      () => new Promise((resolve) => { releaseOwner = () => resolve(null); }),
    );

    // A real, independent computation claims the row first (as if a normal
    // page-load-triggered getCompanyIntegritySnapshot() got there first).
    const ownerPromise = getCompanyIntegritySnapshot(company.id);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const midFlight = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(midFlight!.computingSince).not.toBeNull();

    // The cost-of-debt route must not start a second computation on top of it.
    const putPromise = PUT(makePutRequest(TICKER, 0.0578), { params: { ticker: TICKER } });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1); // still only the owner

    releaseOwner();
    const [ownerResult, putResponse] = await Promise.all([ownerPromise, putPromise]);
    expect(putResponse.status).toBe(200);
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1); // never a second, unclaimed compute
    expect(Object.keys(ownerResult.dimensions).length).toBeGreaterThan(0);
  }, 15000);

  it('[3] two simultaneous cost-of-debt refreshes for the same company: effectively one computation', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
    vi.mocked(saveCostOfDebtOverride).mockResolvedValue(0.06);
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const [r1, r2] = await Promise.all([
      PUT(makePutRequest(TICKER, 0.06), { params: { ticker: TICKER } }),
      PUT(makePutRequest(TICKER, 0.06), { params: { ticker: TICKER } }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row!.computingSince).toBeNull();
  });

  it('[4] cost-of-debt refresh racing with a direct getCompanyIntegritySnapshot() call: effectively one computation', async () => {
    await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
    const company = (await db.company.findUnique({ where: { ticker: TICKER } }))!;
    vi.mocked(saveCostOfDebtOverride).mockResolvedValue(0.0578);
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const [putResponse, directResult] = await Promise.all([
      PUT(makePutRequest(TICKER, 0.0578), { params: { ticker: TICKER } }),
      getCompanyIntegritySnapshot(company.id),
    ]);

    expect(putResponse.status).toBe(200);
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    expect(Object.keys(directResult.dimensions).length).toBeGreaterThan(0);
  });

  it('[5] first-ever company (no IntegritySnapshot row at all) + cost-of-debt refresh: handled via the same first-row create race, no special-casing needed', async () => {
    await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
    vi.mocked(clearCostOfDebtOverride).mockResolvedValue(undefined);
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const preExisting = await db.integritySnapshot.findUnique({ where: { companyId: (await db.company.findUnique({ where: { ticker: TICKER } }))!.id } });
    expect(preExisting).toBeNull(); // confirms this really is the first-ever case

    const response = await DELETE(makeDeleteRequest(TICKER), { params: { ticker: TICKER } });

    expect(response.status).toBe(200);
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    const company = (await db.company.findUnique({ where: { ticker: TICKER } }))!;
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row).not.toBeNull();
    expect(Object.keys(row!.dimensions as object).length).toBeGreaterThan(0);
  });

  it('[6] a failed cost-of-debt-triggered computation is swallowed by the route\'s existing best-effort behavior, and leaves no placeholder behind', async () => {
    const { fetchTargetAndPeers } = await import('@/lib/services/compsDataService');
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
    vi.mocked(saveCostOfDebtOverride).mockResolvedValue(0.0578);
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([{ metrics: { ticker: 'PEER1' } }] as never);
    vi.mocked(fetchTargetAndPeers).mockRejectedValue(new Error('simulated genuine failure'));

    const response = await PUT(makePutRequest(TICKER, 0.0578), { params: { ticker: TICKER } });

    // The route's pre-existing best-effort contract: a snapshot-refresh
    // failure must never turn a successful override save into an error
    // response.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ costOfDebtOverride: 0.0578 });

    // And the failed computation must not have left a placeholder-looking
    // row behind — deleted, per releaseSnapshotComputationClaim.
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row).toBeNull();

    vi.mocked(fetchTargetAndPeers).mockReset();
  });

  it('[7] an abandoned computation (lease already expired) is safely reclaimed by the cost-of-debt refresh rather than hanging', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
    vi.mocked(saveCostOfDebtOverride).mockResolvedValue(0.0578);
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const abandonedClaim = new Date(Date.now() - 10 * 60 * 1000); // well past the 180s lease
    await db.integritySnapshot.create({
      data: { companyId: company.id, status: 'REVIEW_REQUIRED', reasons: [], dimensions: {}, computedAt: abandonedClaim, computingSince: abandonedClaim },
    });

    const response = await PUT(makePutRequest(TICKER, 0.0578), { params: { ticker: TICKER } });

    expect(response.status).toBe(200);
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row).not.toBeNull();
    expect(Object.keys(row!.dimensions as object).length).toBeGreaterThan(0);
    expect(row!.computingSince).toBeNull();
  });
});
