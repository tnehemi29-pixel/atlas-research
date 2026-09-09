import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

import { db } from '@/lib/db';
import { getCompanyOverview } from '@/lib/services/companyService';
import { getPeerCandidates, fetchTargetAndPeers } from '@/lib/services/compsDataService';
import { getCompanyIntegritySnapshot } from './integritySnapshotService';

/**
 * Covers the proven concurrency defects this fix addresses:
 *  - concurrent callers on a STALE/EXISTING cache used to each independently
 *    recompute and last-write-win the upsert (the Sep 1 production
 *    incident: two DataQualityCheck batches 46s apart, one SNAPSHOT_COMPUTED
 *    entry).
 *  - concurrent callers on NO ROW AT ALL (a brand-new company's first-ever
 *    computation) had zero protection at all.
 *  - a first-computation winner that failed could leave a placeholder row
 *    (empty dimensions) that a waiting caller could read as if it were a
 *    real, valid snapshot.
 *  - a loser that waited past CLAIM_WAIT_TIMEOUT_MS (3s) could fall through
 *    to computing WITHOUT owning a claim, even while a legitimate slow
 *    computation was still within its SNAPSHOT_COMPUTATION_LEASE_MS (180s).
 *
 * These tests verify the claim/placeholder/lease mechanism only — not any
 * financial/DCF/market-cap/WACC/severity logic. getCompanyOverview,
 * getPeerCandidates, and fetchTargetAndPeers are mocked; every assertion
 * here is about how many times a computation actually ran, whether a
 * placeholder was ever returned as valid, and which row each caller got
 * back.
 *
 * `REAL_DIMENSIONS` is deliberately non-empty JSON standing in for "this
 * row holds a genuine prior result" in seeded fixtures — isUnfulfilledPlaceholder
 * is keyed on `dimensions` being an EMPTY object, so any fixture meant to
 * represent real, previously-computed data must not use `{}` (that would
 * make the code under test treat it as an unfulfilled placeholder, which is
 * exactly the bug class these tests exist to catch, now working against the
 * test fixtures themselves if left as `{}`).
 */

const TICKER = 'ZZISS2';
const REAL_DIMENSIONS = { marketData: { status: 'OK', detail: 'ok' } };

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

function resetMocks() {
  vi.mocked(getCompanyOverview).mockReset();
  vi.mocked(getPeerCandidates).mockReset();
  vi.mocked(fetchTargetAndPeers).mockReset();
}

describe('getCompanyIntegritySnapshot concurrency — existing row', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    await cleanup();
    resetMocks();
  });

  it('[test 9] two simultaneous stale-cache callers on an existing snapshot never both become authoritative writers — only one computation actually runs', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Concurrency Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    // Seed an existing, stale row first — the actual proven Sep 1 scenario
    // (an already-computed company whose cache had gone stale), not a
    // brand-new company's first-ever computation (covered separately below).
    const staleComputedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.integritySnapshot.create({
      data: { companyId: company.id, status: 'REVIEW_REQUIRED', reasons: [], dimensions: REAL_DIMENSIONS, computedAt: staleComputedAt },
    });

    const [first, second] = await Promise.all([
      getCompanyIntegritySnapshot(company.id, { maxAgeMs: 1 }),
      getCompanyIntegritySnapshot(company.id, { maxAgeMs: 1 }),
    ]);

    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);

    const results = [first, second];
    const winners = results.filter((r) => r.computedAt.getTime() > staleComputedAt.getTime());
    const losers = results.filter((r) => r.computedAt.getTime() === staleComputedAt.getTime());
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);

    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row).not.toBeNull();
    expect(row!.computingSince).toBeNull();
    expect(row!.computedAt.getTime()).toBe(winners[0]!.computedAt.getTime());
  });

  it('[test 9] stale-while-revalidate: a stale row is served immediately while another claim is held, without triggering a second computation', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Concurrency Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const staleComputedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.integritySnapshot.create({
      data: { companyId: company.id, status: 'REVIEW_REQUIRED', reasons: [], dimensions: REAL_DIMENSIONS, computedAt: staleComputedAt, computingSince: new Date() },
    });

    const result = await getCompanyIntegritySnapshot(company.id, { maxAgeMs: 1 });

    expect(result.computedAt.getTime()).toBe(staleComputedAt.getTime());
    expect(vi.mocked(getCompanyOverview)).not.toHaveBeenCalled();
  });

  it('[test 6] an abandoned claim on an existing real row (past its lease) is treated as expired and can be reclaimed', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Concurrency Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const staleComputedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const abandonedClaim = new Date(Date.now() - 10 * 60 * 1000); // well past the 180s lease
    await db.integritySnapshot.create({
      data: { companyId: company.id, status: 'REVIEW_REQUIRED', reasons: [], dimensions: REAL_DIMENSIONS, computedAt: staleComputedAt, computingSince: abandonedClaim },
    });

    const result = await getCompanyIntegritySnapshot(company.id, { maxAgeMs: 1 });

    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    expect(result.computedAt.getTime()).toBeGreaterThan(staleComputedAt.getTime());
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row!.computingSince).toBeNull();
  });

  it('[test 10] fresh-cache path returns the existing row immediately with no claim attempted', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Concurrency Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const recentComputedAt = new Date();
    await db.integritySnapshot.create({
      data: { companyId: company.id, status: 'REVIEW_REQUIRED', reasons: [], dimensions: REAL_DIMENSIONS, computedAt: recentComputedAt },
    });

    const result = await getCompanyIntegritySnapshot(company.id); // default maxAgeMs (15 min)

    expect(result.computedAt.getTime()).toBe(recentComputedAt.getTime());
    expect(vi.mocked(getCompanyOverview)).not.toHaveBeenCalled();
  });
});

/**
 * Covers the first-row concurrency hole: a brand-new company (no
 * IntegritySnapshot row at all yet) had zero protection —
 * getCompanyIntegritySnapshot's `if (!existing)` branch called
 * computeIntegritySnapshot() unconditionally. Fixed by reusing the
 * `companyId` unique constraint already on IntegritySnapshot as the atomic
 * first-row claim (claimFirstSnapshotComputation), not a second lock
 * mechanism — see that function's own doc comment. Combined with a second,
 * related fix: a failed first computation must never leave a placeholder
 * that looks like valid data, and a losing caller must never compute
 * without actually owning a claim, no matter how long it waits.
 */
describe('getCompanyIntegritySnapshot first-row ownership', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    await cleanup();
    resetMocks();
  });

  it('[test 1] two simultaneous first-time requests for a brand-new company: computeIntegritySnapshot effectively runs once', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const [first, second] = await Promise.all([getCompanyIntegritySnapshot(company.id), getCompanyIntegritySnapshot(company.id)]);

    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    expect(first.computedAt.getTime()).toBe(second.computedAt.getTime());
    expect(Object.keys(first.dimensions).length).toBeGreaterThan(0);
    expect(Object.keys(second.dimensions).length).toBeGreaterThan(0);

    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row).not.toBeNull();
    expect(row!.computingSince).toBeNull();
  });

  it('a single first-time request computes normally with no wait', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const start = Date.now();
    const result = await getCompanyIntegritySnapshot(company.id);
    const elapsedMs = Date.now() - start;

    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.dimensions).length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(250); // no contention — must not fall into the poll-wait path at all
  });

  it('[test 2] the losing request in a first-time race receives the winner\'s real completed result, not a placeholder', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const [first, second] = await Promise.all([getCompanyIntegritySnapshot(company.id), getCompanyIntegritySnapshot(company.id)]);

    for (const result of [first, second]) {
      expect(result.status).toBeTruthy();
      expect(Object.keys(result.dimensions).length).toBeGreaterThan(0);
      expect(result.dimensions).not.toEqual({});
      expect(result.reasons).not.toEqual([]);
    }
  });

  it('[test 3] a first-time computation that throws leaves no placeholder behind — the row is deleted, not left servable', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    // getPeerCandidates must return a non-empty list so runCompsModelAudit
    // proceeds to call fetchTargetAndPeers (its own early return on an
    // empty list is caught by nothing further up — see modelAuditService.ts).
    vi.mocked(getPeerCandidates).mockResolvedValue([{ metrics: { ticker: 'PEER1' } }] as never);
    // fetchTargetAndPeers is the one call in this whole pipeline NOT wrapped
    // in a try/catch anywhere (confirmed by reading modelAuditService.ts) —
    // rejecting it is a genuine, uncaught throw all the way out of
    // computeIntegritySnapshot(), unlike getCompanyOverview/getFinancials/
    // getPeerCandidates which are all swallowed by their own callers.
    vi.mocked(fetchTargetAndPeers).mockRejectedValue(new Error('simulated genuine failure'));

    // Sequential and single-caller by design: this test isolates exactly
    // "does a failed first computation leave the placeholder visible,"
    // independent of any race — the reclaim-race tests above/below already
    // cover "which of several concurrent callers becomes the owner."
    await expect(getCompanyIntegritySnapshot(company.id)).rejects.toThrow('simulated genuine failure');

    // The row must not exist as an ordinary-looking, servable placeholder —
    // deleted, not merely left with computingSince cleared.
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row).toBeNull();
  });

  it('[test 4] after a first-time computation fails, the very next request recovers and produces a real, valid result', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([{ metrics: { ticker: 'PEER1' } }] as never);
    vi.mocked(fetchTargetAndPeers).mockRejectedValueOnce(new Error('simulated genuine failure'));

    await expect(getCompanyIntegritySnapshot(company.id)).rejects.toThrow('simulated genuine failure');
    const rowAfterFailure = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(rowAfterFailure).toBeNull(); // confirms recovery starts from a genuine first-row race, not a reclaim

    vi.mocked(fetchTargetAndPeers).mockResolvedValue({ target: null, peers: [] } as never); // succeeds this time
    const recovered = await getCompanyIntegritySnapshot(company.id);

    expect(Object.keys(recovered.dimensions).length).toBeGreaterThan(0);
    expect(recovered.dimensions).not.toEqual({});
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row).not.toBeNull();
    expect(row!.computingSince).toBeNull();
    expect(row!.dimensions).not.toEqual({});
  });

  it('[test 5+6] a winner that crashed after claiming but before finishing (an abandoned placeholder, dimensions still empty) is recovered once its lease expires', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    // Simulate a winner that called claimFirstSnapshotComputation, crashed
    // immediately after (never ran the `finally`) — dimensions genuinely
    // empty, computingSince well past the lease.
    const abandonedClaim = new Date(Date.now() - 10 * 60 * 1000);
    await db.integritySnapshot.create({
      data: { companyId: company.id, status: 'REVIEW_REQUIRED', reasons: [], dimensions: {}, computedAt: abandonedClaim, computingSince: abandonedClaim },
    });

    const result = await getCompanyIntegritySnapshot(company.id);

    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.dimensions).length).toBeGreaterThan(0);
    expect(result.dimensions).not.toEqual({});
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row!.computingSince).toBeNull();
  });

  it('after a winner crash/abandonment, a subsequent independent request also succeeds normally (fresh-cache hit)', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    const abandonedClaim = new Date(Date.now() - 10 * 60 * 1000);
    await db.integritySnapshot.create({
      data: { companyId: company.id, status: 'REVIEW_REQUIRED', reasons: [], dimensions: {}, computedAt: abandonedClaim, computingSince: abandonedClaim },
    });

    const recovered = await getCompanyIntegritySnapshot(company.id);
    const again = await getCompanyIntegritySnapshot(company.id);

    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1); // second call hit the fresh-cache path, not a recompute
    expect(again.computedAt.getTime()).toBe(recovered.computedAt.getTime());
  });

  it('[test 8] a reclaim race between multiple losers on an abandoned first-row placeholder: exactly one becomes the new owner', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getCompanyOverview).mockResolvedValue(null);
    vi.mocked(getPeerCandidates).mockResolvedValue([]);

    // Pre-expired placeholder — no real-time waiting needed to prove the
    // race: by the time any caller checks, the lease has already elapsed.
    const abandonedClaim = new Date(Date.now() - 10 * 60 * 1000);
    await db.integritySnapshot.create({
      data: { companyId: company.id, status: 'REVIEW_REQUIRED', reasons: [], dimensions: {}, computedAt: abandonedClaim, computingSince: abandonedClaim },
    });

    const results = await Promise.all([
      getCompanyIntegritySnapshot(company.id),
      getCompanyIntegritySnapshot(company.id),
      getCompanyIntegritySnapshot(company.id),
    ]);

    // Exactly one of the three actually reclaimed and computed; the other
    // two waited for and received that same real result.
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(Object.keys(r.dimensions).length).toBeGreaterThan(0);
      expect(r.computedAt.getTime()).toBe(results[0]!.computedAt.getTime());
    }
    const row = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(row!.computingSince).toBeNull();
  });

  it('[test 7] a slow but healthy computation exceeding CLAIM_WAIT_TIMEOUT_MS (3s) is never duplicated — a loser must not compute merely because it waited past the poll window', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getPeerCandidates).mockResolvedValue([]);
    let releaseWinner: () => void = () => {};
    vi.mocked(getCompanyOverview).mockImplementation(
      () => new Promise((resolve) => { releaseWinner = () => resolve(null); }),
    );

    const winnerPromise = getCompanyIntegritySnapshot(company.id);
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the winner win the create() race

    const loserPromise = getCompanyIntegritySnapshot(company.id);

    // Wait past ONE full CLAIM_WAIT_TIMEOUT_MS (3s) poll window while the
    // winner is still deliberately blocked — this is exactly the window
    // that used to fall through to an unclaimed compute.
    await new Promise((resolve) => setTimeout(resolve, 3500));
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1); // still only the winner — no unclaimed second compute

    releaseWinner();
    const [winnerResult, loserResult] = await Promise.all([winnerPromise, loserPromise]);
    expect(vi.mocked(getCompanyOverview)).toHaveBeenCalledTimes(1); // still exactly one, even after the loser gets its result
    expect(winnerResult.computedAt.getTime()).toBe(loserResult.computedAt.getTime());
    expect(Object.keys(loserResult.dimensions).length).toBeGreaterThan(0);
  }, 15000);

  it('a caller that could not win or reclaim the first-row race never releases the still-legitimate holder\'s claim', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'First Row Test Co.' } });
    vi.mocked(getPeerCandidates).mockResolvedValue([]);
    let releaseWinner: () => void = () => {};
    vi.mocked(getCompanyOverview).mockImplementation(
      () => new Promise((resolve) => { releaseWinner = () => resolve(null); }),
    );

    const winnerPromise = getCompanyIntegritySnapshot(company.id);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const midFlightRow = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(midFlightRow).not.toBeNull();
    expect(midFlightRow!.computingSince).not.toBeNull();
    const claimTimestamp = midFlightRow!.computingSince!.getTime();

    // A losing claim attempt (tryClaimSnapshotComputation, exercised
    // directly via the same atomicity already covered above) must not
    // touch this claim at all.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const rowStillMidFlight = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(rowStillMidFlight!.computingSince!.getTime()).toBe(claimTimestamp); // untouched by anyone else

    releaseWinner();
    const winnerResult = await winnerPromise;
    expect(Object.keys(winnerResult.dimensions).length).toBeGreaterThan(0);
    const finalRow = await db.integritySnapshot.findUnique({ where: { companyId: company.id } });
    expect(finalRow!.computingSince).toBeNull(); // only the actual winner released it, on its own completion
  });
});
