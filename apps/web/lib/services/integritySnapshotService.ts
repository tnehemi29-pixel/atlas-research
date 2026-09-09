import { Prisma, type IntegrityDatasetType, type IntegrityIssueCategory, type IntegrityIssueSeverity, type IntegritySnapshot } from '@prisma/client';
import { db } from '@/lib/db';
import { runDataQualityChecks, type DataQualityCheckOutcome } from '@/lib/services/dataQualityService';
import { runDcfModelAudit, runCompsModelAudit } from '@/lib/services/modelAuditService';
import { syncIssuesFromFindings, type FindingForIssueSync } from '@/lib/services/integrityIssueService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';
import { computeIntegrityStatus, type ResearchIntegrityStatusValue } from '@/lib/integrity/integrityStatus';
import type { IntegrityFinding } from '@/lib/integrity/types';

/**
 * Milestone 14 spec sections 18-20, 29 — the top-level orchestrator: runs
 * every check/audit this milestone defines for one company, turns failing
 * results into tracked issues (via integrityIssueService's dedupe/auto-
 * resolve discipline), computes the company's overall status (via
 * integrityStatus.ts's explainable aggregation), and caches the result as
 * one upserted IntegritySnapshot row rather than recomputing on every page
 * load. `getCompanyIntegritySnapshot` serves the cached row when it's
 * recent enough and only recomputes on a cache miss or explicit refresh —
 * the same TTL-cache discipline Milestone 3's financialDataService already
 * established, applied here instead of a background job queue (which this
 * codebase has never had, by design).
 */

const DEFAULT_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export type DimensionStatusValue = 'OK' | 'NEEDS_REVIEW' | 'ERROR' | 'UNKNOWN';

export interface DimensionSummary {
  status: DimensionStatusValue;
  detail: string;
}

export interface IntegritySnapshotDimensions {
  marketData: DimensionSummary;
  financialStatements: DimensionSummary;
  secFilings: DimensionSummary;
  earnings: DimensionSummary;
  dcf: DimensionSummary;
  comps: DimensionSummary;
  investmentCase: DimensionSummary;
}

function dataQualityIssueCategory(outcome: DataQualityCheckOutcome): IntegrityIssueCategory {
  if (outcome.dimension === 'FRESHNESS') return 'DATA_FRESHNESS';
  if (outcome.dimension === 'COMPLETENESS') return 'DATA_COMPLETENESS';
  return outcome.datasetType === 'MARKET_DATA' ? 'MARKET_DATA_INTEGRITY' : 'FINANCIAL_RECONCILIATION';
}

function dataQualityIssueSeverity(outcome: DataQualityCheckOutcome): IntegrityIssueSeverity {
  if (outcome.dimension === 'FRESHNESS') return outcome.freshnessStatus === 'UNKNOWN' ? 'LOW' : 'MEDIUM';
  if (outcome.dimension === 'COMPLETENESS') return 'MEDIUM';
  return 'HIGH';
}

function dataQualityDedupeKey(outcome: DataQualityCheckOutcome): string {
  const checkName = typeof outcome.metadata?.checkName === 'string' ? outcome.metadata.checkName : outcome.detail.split(':')[0];
  return `dq:${outcome.datasetType}:${outcome.dimension}:${checkName}`;
}

function modelFindingToIssue(modelType: 'DCF_MODEL' | 'COMPS_MODEL', finding: IntegrityFinding): FindingForIssueSync {
  return {
    category: modelType === 'DCF_MODEL' ? 'DCF_MODEL_ERROR' : 'COMPS_MODEL_ERROR',
    severity: finding.severity === 'INFO' ? 'LOW' : finding.severity,
    datasetType: modelType,
    description: finding.message,
    source: modelType === 'DCF_MODEL' ? 'modelAuditService:dcf' : 'modelAuditService:comps',
    dedupeKey: `${modelType === 'DCF_MODEL' ? 'dcf' : 'comps'}:${finding.check}`,
    passed: finding.passed,
  };
}

function dimensionFromOutcomes(datasetType: IntegrityDatasetType, outcomes: DataQualityCheckOutcome[]): DimensionSummary {
  const relevant = outcomes.filter((o) => o.datasetType === datasetType);
  if (relevant.length === 0) return { status: 'UNKNOWN', detail: 'No checks have been run for this dataset yet.' };

  const failing = relevant.filter((o) => !o.passed);
  if (failing.length === 0) return { status: 'OK', detail: relevant.map((o) => o.detail).join(' ') };

  const hasHighSeverity = failing.some((o) => o.dimension === 'CALCULATION_INTEGRITY');
  return { status: hasHighSeverity ? 'ERROR' : 'NEEDS_REVIEW', detail: failing.map((o) => o.detail).join(' ') };
}

function dimensionFromModelFindings(findings: IntegrityFinding[] | null): DimensionSummary {
  if (findings === null) return { status: 'UNKNOWN', detail: 'Not enough data was available to audit this model.' };
  const failing = findings.filter((f) => !f.passed);
  if (failing.length === 0) return { status: 'OK', detail: 'No issues detected.' };
  const hasCriticalOrHigh = failing.some((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
  return { status: hasCriticalOrHigh ? 'ERROR' : 'NEEDS_REVIEW', detail: failing.map((f) => f.message).join(' ') };
}

export interface ComputeSnapshotResult {
  status: ResearchIntegrityStatusValue;
  reasons: string[];
  dimensions: IntegritySnapshotDimensions;
  openIssueCount: number;
  criticalIssueCount: number;
}

export async function computeIntegritySnapshot(companyId: string): Promise<ComputeSnapshotResult> {
  const [dataQualityOutcomes, dcfAudit, compsAudit, investmentCaseCount] = await Promise.all([
    runDataQualityChecks(companyId),
    runDcfModelAudit(companyId),
    runCompsModelAudit(companyId),
    db.investmentCase.count({ where: { companyId } }),
  ]);

  const findings: FindingForIssueSync[] = [
    ...dataQualityOutcomes.map((o): FindingForIssueSync => ({
      category: dataQualityIssueCategory(o),
      severity: dataQualityIssueSeverity(o),
      datasetType: o.datasetType,
      description: o.detail,
      source: 'dataQualityService',
      dedupeKey: dataQualityDedupeKey(o),
      passed: o.passed,
    })),
    ...(dcfAudit?.findings.map((f) => modelFindingToIssue('DCF_MODEL', f)) ?? []),
    ...(compsAudit?.findings.map((f) => modelFindingToIssue('COMPS_MODEL', f)) ?? []),
  ];

  await syncIssuesFromFindings(companyId, findings);

  const [openIssues, criticalIssues] = await Promise.all([
    db.researchIntegrityIssue.count({ where: { companyId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
    db.researchIntegrityIssue.count({ where: { companyId, status: { in: ['OPEN', 'ACKNOWLEDGED'] }, severity: 'CRITICAL' } }),
  ]);

  const openFindingsBySeverity = findings.filter((f) => !f.passed);
  const statusInput = {
    criticalFindingCount: openFindingsBySeverity.filter((f) => f.severity === 'CRITICAL').length,
    highFindingCount: openFindingsBySeverity.filter((f) => f.severity === 'HIGH').length,
    mediumFindingCount: openFindingsBySeverity.filter((f) => f.severity === 'MEDIUM').length,
    lowFindingCount: openFindingsBySeverity.filter((f) => f.severity === 'LOW').length,
    staleDatasetCount: dataQualityOutcomes.filter((o) => o.dimension === 'FRESHNESS' && o.freshnessStatus === 'STALE').length,
  };
  const { status, reasons } = computeIntegrityStatus(statusInput);

  const dimensions: IntegritySnapshotDimensions = {
    marketData: dimensionFromOutcomes('MARKET_DATA', dataQualityOutcomes),
    financialStatements: dimensionFromOutcomes('FINANCIAL_STATEMENTS', dataQualityOutcomes),
    secFilings: dimensionFromOutcomes('SEC_FILINGS', dataQualityOutcomes),
    earnings: dimensionFromOutcomes('EARNINGS', dataQualityOutcomes),
    dcf: dimensionFromModelFindings(dcfAudit?.findings ?? null),
    comps: dimensionFromModelFindings(compsAudit?.findings ?? null),
    investmentCase:
      investmentCaseCount > 0
        ? { status: 'OK', detail: `${investmentCaseCount} investment case(s) tracked for this company. Thesis-vs-guidance conflicts are checked per-case by each case's own owner.` }
        : { status: 'UNKNOWN', detail: 'No investment case has been created for this company yet.' },
  };

  await db.integritySnapshot.upsert({
    where: { companyId },
    create: { companyId, status, reasons: reasons as unknown as Prisma.InputJsonValue, dimensions: dimensions as unknown as Prisma.InputJsonValue, openIssueCount: openIssues, criticalIssueCount: criticalIssues },
    update: { status, reasons: reasons as unknown as Prisma.InputJsonValue, dimensions: dimensions as unknown as Prisma.InputJsonValue, openIssueCount: openIssues, criticalIssueCount: criticalIssues, computedAt: new Date() },
  });

  await writeAuditLogEntry({ companyId, entityType: 'IntegritySnapshot', action: 'SNAPSHOT_COMPUTED', detail: { status, openIssueCount: openIssues, criticalIssueCount: criticalIssues } });

  return { status, reasons, dimensions, openIssueCount: openIssues, criticalIssueCount: criticalIssues };
}

/** Serves the cached snapshot when it's recent enough; recomputes on a
 * cache miss or when the cached row is older than `maxAgeMs`. This is the
 * "incremental, don't recompute the whole research stack on every page
 * load" discipline spec section 29 asks for — there is no background job
 * queue in this codebase (by design, matching every prior milestone), so
 * "incremental" here means TTL-cached-and-recomputed-on-demand, not
 * continuously re-evaluated. */
export type IntegritySnapshotWithParsedJson = Omit<IntegritySnapshot, 'dimensions' | 'reasons' | 'computingSince'> & { dimensions: IntegritySnapshotDimensions; reasons: string[] };

/** How long a claimed computation is trusted before a later caller is
 * allowed to treat it as abandoned and reclaim it. Observed production
 * computeIntegritySnapshot() durations in this codebase's own audit trail
 * range from ~2s to ~23s (no re-ingestion needed). The worst realistic case
 * is a cold financialsSyncedAt TTL forcing runDcfModelAudit's getFinancials()
 * into a full multi-batch SEC re-ingestion — bounded, in the very worst
 * case, only by Vercel's own 300s (Hobby+Fluid) function ceiling, since the
 * platform kills the function at that point regardless of this lease. This
 * value is deliberately far above every observed duration (roughly 8x-90x)
 * so a legitimate slow run is never mistaken for abandoned, while staying
 * comfortably under the 300s hard ceiling (120s of margin) so a genuinely
 * killed/crashed holder — one that never reaches the `finally` below — is
 * recoverable well before that ceiling, not after nearly the full 5 minutes. */
const SNAPSHOT_COMPUTATION_LEASE_MS = 180_000;

const CLAIM_WAIT_POLL_INTERVAL_MS = 250;
/** How long a caller that cannot silently accept stale data (forceRefresh,
 * or a company with no cached snapshot at all yet) waits for another
 * caller's already-claimed computation to land before giving up and
 * computing it itself. Short and bounded on purpose — this only exists to
 * avoid a redundant computation in the common case where the in-flight one
 * is seconds from finishing; it is never the only thing standing between a
 * caller and a result. */
const CLAIM_WAIT_TIMEOUT_MS = 3_000;

function parseSnapshotRow(row: IntegritySnapshot): IntegritySnapshotWithParsedJson {
  const { computingSince: _computingSince, ...rest } = row;
  return { ...rest, dimensions: row.dimensions as unknown as IntegritySnapshotDimensions, reasons: row.reasons as unknown as string[] };
}

/**
 * True only for a row whose `dimensions` has never been set by a real,
 * completed computeIntegritySnapshot() run — the transient row
 * claimFirstSnapshotComputation creates to win the very first computation
 * for a company, for as long as that computation hasn't finished (or if it
 * failed before finishing and, exceptionally, wasn't deleted — see
 * releaseSnapshotComputationClaim). Never true for a genuine previously-
 * computed result, even one currently being refreshed (its `dimensions`
 * still holds the last real result throughout that refresh).
 *
 * Deliberately keyed on `dimensions` alone, not a timestamp comparison: an
 * earlier version of this check compared `computedAt` against
 * `computingSince` for equality, which broke the moment a crashed
 * placeholder was legitimately reclaimed — reclaiming only ever sets
 * `computingSince` (see tryClaimSnapshotComputation), so that equality
 * silently went false while the row was still garbage. computeIntegrity-
 * Snapshot()'s own dimensions builder always populates all seven keys
 * (marketData, financialStatements, secFilings, earnings, dcf, comps,
 * investmentCase) unconditionally for every company, so an empty object is
 * a signal only the as-yet-unfulfilled placeholder can ever produce — and,
 * unlike the timestamp comparison, it survives any number of reclaim
 * attempts, since nothing but a genuine completed computation ever writes
 * to `dimensions` at all.
 */
function isUnfulfilledPlaceholder(row: Pick<IntegritySnapshot, 'dimensions'>): boolean {
  return Object.keys(row.dimensions as Record<string, unknown>).length === 0;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Atomically claims the right to (re)compute a company's snapshot via one
 * conditional UPDATE — Prisma's own `updateMany`, not raw SQL. This compiles
 * to a single `UPDATE ... WHERE ...` statement (no explicit transaction, no
 * advisory lock, no assumption about which physical connection executes it),
 * so Postgres's own row-level locking still serializes concurrent UPDATEs to
 * the same row: at most one concurrent caller ever observes `computingSince`
 * as unclaimed and sets it; every other concurrent caller's update matches
 * zero rows. Also returns null (nothing to claim) when no row exists yet
 * for this company.
 *
 * Deliberately not `$executeRaw`: an earlier version compared
 * `computingSince` against a raw SQL parameter directly and silently never
 * matched, because Postgres implicitly reinterprets a `timestamptz`-typed
 * bound parameter against this column's `timestamp` (no time zone) type,
 * shifting the compared value by the session's time zone offset. Prisma's
 * own query builder — the same one every other DateTime comparison in this
 * codebase already goes through — doesn't have that failure mode.
 *
 * Returns the exact `Date` written as `computingSince` on success (not just
 * `true`) — the caller must hand this back to releaseSnapshotComputationClaim
 * so a release can prove it's still releasing the claim it actually won,
 * not one a later reclaimer has since taken over.
 */
async function tryClaimSnapshotComputation(companyId: string): Promise<Date | null> {
  const leaseExpiry = new Date(Date.now() - SNAPSHOT_COMPUTATION_LEASE_MS);
  const claimedAt = new Date();
  const { count } = await db.integritySnapshot.updateMany({
    where: { companyId, OR: [{ computingSince: null }, { computingSince: { lt: leaseExpiry } }] },
    data: { computingSince: claimedAt },
  });
  return count > 0 ? claimedAt : null;
}

/**
 * Atomically claims the right to run the very first computation ever for a
 * company, using the `companyId` unique constraint already on this model —
 * not a new concurrency primitive. Only one concurrent `create()` for the
 * same `companyId` can ever succeed (Postgres rejects every other one with
 * a P2002 unique-violation), so at most one caller ever wins this. The
 * winner's own row is written here (marked, per isUnfulfilledPlaceholder, as
 * not-yet-real) so it is never mistaken for a completed result before the
 * winner's real computation lands and overwrites it.
 *
 * Returns the claim's `computedAt`/`computingSince` timestamp on success, or
 * null if someone else already has this — either a genuine unfulfilled
 * placeholder from a moment-earlier winner, or, on the very rare timing
 * where the row now exists as a real result already, that too counts as
 * "not my job to create it."
 */
async function claimFirstSnapshotComputation(companyId: string): Promise<Date | null> {
  const now = new Date();
  try {
    await db.integritySnapshot.create({
      data: {
        companyId,
        status: 'REVIEW_REQUIRED', // placeholder only — never read without isUnfulfilledPlaceholder's guard
        reasons: [],
        dimensions: {},
        computedAt: now,
        computingSince: now,
      },
    });
    return now;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) return null;
    throw error;
  }
}

/**
 * Releases a claim this exact caller won — called from a `finally`, so a
 * thrown error during computation never leaves the claim held past this
 * call. Takes the caller's own claim timestamp (from tryClaimSnapshotComputation
 * or claimFirstSnapshotComputation) and only ever touches the row if
 * `computingSince` still equals exactly that value: if a computation runs
 * long enough for its own lease to expire, another caller may have already
 * legitimately reclaimed the row before this one finishes, and this
 * function must never clear or delete THAT caller's active claim out from
 * under it. A mismatch means "not our claim anymore" and this is a no-op.
 *
 * Two different outcomes depending on whether the computation actually
 * finished, distinguished by re-reading the row rather than being told
 * which case this is:
 *  - `dimensions` is still empty (isUnfulfilledPlaceholder): computeIntegrity-
 *    Snapshot()'s own upsert never ran — this was the first-ever computation
 *    for this company and it failed or was interrupted before completing.
 *    The row is DELETED, not left with `computingSince` merely cleared —
 *    an empty-dimensions row with a cleared claim would look like an
 *    ordinary, servable snapshot to every reader. Deleting restores "no row
 *    exists yet" so the next caller goes through the same atomic
 *    create-race immediately, with no lease wait.
 *  - `dimensions` holds real data (either this call's own successful first
 *    computation, or an existing row that was always real): `computingSince`
 *    is simply cleared, exactly as before this change — existing-row
 *    behavior is unmodified.
 */
async function releaseSnapshotComputationClaim(companyId: string, myClaimTimestamp: Date): Promise<void> {
  const row = await db.integritySnapshot.findUnique({ where: { companyId } });
  if (!row || row.computingSince === null || row.computingSince.getTime() !== myClaimTimestamp.getTime()) {
    return;
  }
  if (isUnfulfilledPlaceholder(row)) {
    await db.integritySnapshot.deleteMany({ where: { companyId, computingSince: myClaimTimestamp } });
    return;
  }
  await db.integritySnapshot.updateMany({ where: { companyId, computingSince: myClaimTimestamp }, data: { computingSince: null } });
}

/** Runs the real computation under a held claim and always releases it
 * afterward, success or failure — the one place that actually calls
 * computeIntegritySnapshot() on behalf of a caller that owns the claim.
 * `claimTimestamp` is threaded straight through to releaseSnapshotComputationClaim. */
async function computeAndReturnFreshSnapshot(companyId: string, claimTimestamp: Date): Promise<IntegritySnapshotWithParsedJson> {
  try {
    await computeIntegritySnapshot(companyId);
  } finally {
    await releaseSnapshotComputationClaim(companyId, claimTimestamp);
  }
  const fresh = await db.integritySnapshot.findUniqueOrThrow({ where: { companyId } });
  return parseSnapshotRow(fresh);
}

/** Polls for up to CLAIM_WAIT_TIMEOUT_MS for another caller's claimed
 * computation to land — one polling window, not a give-up threshold for the
 * whole wait (see waitThenRecoverOwnership, which loops this). Returns null
 * on timeout. The `!isUnfulfilledPlaceholder(row)` check is defense in
 * depth: releaseSnapshotComputationClaim is the actual guarantee that a
 * row is never left servable with empty `dimensions`, but this read path
 * doesn't have to trust that alone. */
async function waitForFreshSnapshot(companyId: string, sinceComputedAt: Date | null): Promise<IntegritySnapshotWithParsedJson | null> {
  const deadline = Date.now() + CLAIM_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CLAIM_WAIT_POLL_INTERVAL_MS));
    const row = await db.integritySnapshot.findUnique({ where: { companyId } });
    if (row && row.computingSince === null && !isUnfulfilledPlaceholder(row) && (!sinceComputedAt || row.computedAt.getTime() > sinceComputedAt.getTime())) {
      return parseSnapshotRow(row);
    }
  }
  return null;
}

/**
 * Shared by every "someone else already claimed this" branch below
 * (first-ever row, forceRefresh, and stale-while-revalidate-that-turned-out-
 * to-be-a-placeholder). Loops indefinitely between two things, and NEVER
 * computes without owning a claim:
 *
 *  1. Wait up to CLAIM_WAIT_TIMEOUT_MS for a fresh result to land.
 *  2. If it doesn't, check whether the current claim (if the row still
 *     exists) has actually exceeded SNAPSHOT_COMPUTATION_LEASE_MS. If not,
 *     loop back to (1) — CLAIM_WAIT_TIMEOUT_MS only controls how often this
 *     re-checks, not how long it's willing to wait; a legitimate slow
 *     computation that exceeds the wait window is never treated as
 *     abandoned merely because it's slow. Only once the lease has actually
 *     expired does this attempt to reclaim ownership — and if that reclaim
 *     loses to another simultaneous reclaimer, it loops back to (1) again
 *     rather than computing anyway.
 *
 * If the row has been deleted (a first-ever computation failed and
 * releaseSnapshotComputationClaim removed it — see its own doc comment),
 * this is now a fresh first-row race, handled via
 * claimFirstSnapshotComputation rather than a reclaim.
 */
async function waitThenRecoverOwnership(companyId: string, sinceComputedAt: Date | null): Promise<IntegritySnapshotWithParsedJson> {
  for (;;) {
    const fresh = await waitForFreshSnapshot(companyId, sinceComputedAt);
    if (fresh) return fresh;

    const row = await db.integritySnapshot.findUnique({ where: { companyId } });
    if (!row) {
      const claimedAt = await claimFirstSnapshotComputation(companyId);
      if (claimedAt) return computeAndReturnFreshSnapshot(companyId, claimedAt);
      continue; // someone else won the first-row race a moment before us
    }

    const leaseExpired = row.computingSince === null || Date.now() - row.computingSince.getTime() >= SNAPSHOT_COMPUTATION_LEASE_MS;
    if (!leaseExpired) {
      continue; // owner is still legitimately within its lease — never compute merely because we've waited
    }

    const claimedAt = await tryClaimSnapshotComputation(companyId);
    if (claimedAt) return computeAndReturnFreshSnapshot(companyId, claimedAt);
    // someone else won the reclaim race — loop back and keep waiting, never compute unclaimed
  }
}

/**
 * Concurrency contract (see integritySnapshotService's own investigation
 * history for why this exists — concurrent stale-cache callers used to
 * each independently recompute and last-write-win the upsert):
 *
 *  - Fresh existing snapshot: returned immediately, exactly as before this
 *    change — no claim is even attempted.
 *  - No existing snapshot at all (the very first time a company is ever
 *    checked): claimed atomically via the `companyId` unique constraint
 *    (claimFirstSnapshotComputation) — at most one concurrent caller can
 *    ever win the `create()`; every other simultaneous caller sees a P2002
 *    unique-violation and falls into waitThenRecoverOwnership instead of
 *    computing. The loser never computes merely because it lost this race.
 *  - Stale existing snapshot, another caller already computing (including
 *    the case where "existing" turns out to be an unfulfilled placeholder
 *    left by a first-computation winner that hasn't finished yet): returns
 *    the existing row as-is ONLY if it's a genuine, previously-completed
 *    result (deliberate stale-while-revalidate — the returned `computedAt`
 *    still honestly reflects its age). A placeholder is never returned as
 *    if it were real data — isUnfulfilledPlaceholder routes that case
 *    through the same wait/reclaim path as a first-time loser instead.
 *  - forceRefresh while another caller is already computing: an explicit
 *    refresh must not silently serve stale data, so this also waits via
 *    waitThenRecoverOwnership.
 *  - Computation failure: releaseSnapshotComputationClaim (called from
 *    computeAndReturnFreshSnapshot's `finally`) either clears the claim
 *    (existing row, unchanged) or deletes the row entirely (a first-ever
 *    computation that never reached its own upsert) — never leaves a
 *    servable-looking row with empty `dimensions` and a cleared claim. See
 *    releaseSnapshotComputationClaim's own doc comment.
 *  - Abandoned claim (holder crashed/was killed before its `finally` ran,
 *    for either an existing row or a first-computation placeholder):
 *    self-heals once SNAPSHOT_COMPUTATION_LEASE_MS elapses — the next
 *    caller's claim attempt succeeds again. A slow-but-healthy computation
 *    exceeding CLAIM_WAIT_TIMEOUT_MS is never treated as abandoned merely
 *    for being slow — only actual lease expiry authorizes a reclaim (see
 *    waitThenRecoverOwnership).
 *  - No request ever computes without owning a claim, and no request ever
 *    clears/releases a claim it does not own: every call to
 *    computeAndReturnFreshSnapshot is immediately preceded by a successful
 *    claimFirstSnapshotComputation or tryClaimSnapshotComputation call in
 *    the same branch; there is no other path into it. releaseSnapshot-
 *    ComputationClaim independently verifies the claim it's releasing is
 *    still the exact one its caller won, so even a computation that
 *    outlives its own lease can never clear a later reclaimer's work.
 */
export async function getCompanyIntegritySnapshot(companyId: string, options: { maxAgeMs?: number; forceRefresh?: boolean } = {}): Promise<IntegritySnapshotWithParsedJson> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_SNAPSHOT_MAX_AGE_MS;
  const existing = await db.integritySnapshot.findUnique({ where: { companyId } });

  if (!existing) {
    const claimedAt = await claimFirstSnapshotComputation(companyId);
    if (claimedAt) return computeAndReturnFreshSnapshot(companyId, claimedAt);
    // Someone else won the create race a moment before us.
    return waitThenRecoverOwnership(companyId, null);
  }

  if (isUnfulfilledPlaceholder(existing)) {
    // A first-computation winner's row exists but hasn't been completed
    // yet — never servable, whether "fresh" or "stale", regardless of
    // forceRefresh.
    return waitThenRecoverOwnership(companyId, null);
  }

  if (!options.forceRefresh && Date.now() - existing.computedAt.getTime() < maxAgeMs) {
    return parseSnapshotRow(existing);
  }

  const claimedAt = await tryClaimSnapshotComputation(companyId);
  if (claimedAt) {
    return computeAndReturnFreshSnapshot(companyId, claimedAt);
  }

  // Another caller holds an unexpired claim on this existing row.
  if (options.forceRefresh) {
    return waitThenRecoverOwnership(companyId, existing.computedAt);
  }
  // Stale-while-revalidate: serve the existing, genuinely stale row as-is.
  return parseSnapshotRow(existing);
}

export interface GlobalIntegrityDashboardRow {
  companyId: string;
  ticker: string;
  name: string;
  status: ResearchIntegrityStatusValue;
  dimensions: IntegritySnapshotDimensions;
  openIssueCount: number;
  criticalIssueCount: number;
  computedAt: Date;
}

/** Reads only ALREADY-COMPUTED snapshots — the global dashboard never
 * triggers a full recompute of every company in Atlas on load (spec
 * section 29's own "do not fully recompute every company's entire research
 * stack every time a user opens the dashboard"). A company only appears
 * here once its own page (or an explicit refresh) has computed a snapshot
 * for it at least once — which excludes an unfulfilled first-computation
 * placeholder (see isUnfulfilledPlaceholder) exactly as it always excluded
 * a company with no row at all; the filter here is consistent with, not a
 * change to, this function's existing contract. Includes each company's
 * per-dimension breakdown so the dashboard UI (spec section 20) can filter
 * by category (Data/DCF/Comps/SEC/Earnings/Investment Cases) without a
 * separate query per category — there are few enough companies with a
 * computed snapshot that filtering this list client-side is simpler than a
 * server-side query for each category. */
export async function getGlobalIntegrityDashboard(): Promise<GlobalIntegrityDashboardRow[]> {
  const snapshots = await db.integritySnapshot.findMany({
    include: { company: { select: { ticker: true, name: true } } },
    orderBy: [{ status: 'desc' }, { computedAt: 'desc' }],
  });

  return snapshots.filter((s) => !isUnfulfilledPlaceholder(s)).map((s) => ({
    companyId: s.companyId,
    ticker: s.company.ticker,
    name: s.company.name,
    status: s.status as ResearchIntegrityStatusValue,
    dimensions: s.dimensions as unknown as IntegritySnapshotDimensions,
    openIssueCount: s.openIssueCount,
    criticalIssueCount: s.criticalIssueCount,
    computedAt: s.computedAt,
  }));
}
