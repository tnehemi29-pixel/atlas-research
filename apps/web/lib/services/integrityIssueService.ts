import type { IntegrityDatasetType, IntegrityIssueCategory, IntegrityIssueSeverity, ResearchIntegrityIssue } from '@prisma/client';
import { db } from '@/lib/db';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';

/**
 * Milestone 14 spec sections 21-22 — issue tracking and its resolution
 * workflow. `syncIssuesFromFindings` is the one write path every audit
 * module's findings flow through to become tracked issues — mirroring
 * ResearchEvent's `dedupeKey` discipline (Milestone 11): a problem that's
 * still present on the next check run never creates a second OPEN issue,
 * and a resolved/ignored issue is never silently reopened or rewritten.
 *
 * Only a narrow, explicitly-listed set of categories may ever be
 * auto-resolved (spec section 22: successful data refresh, a source
 * becoming available, a stale cache clearing) — financial discrepancies,
 * DCF/comps model errors, research contradictions, and thesis conflicts
 * always require a human to resolve them.
 */

export class IntegrityIssueNotFoundError extends Error {
  constructor(message = 'Integrity issue not found.') {
    super(message);
    this.name = 'IntegrityIssueNotFoundError';
  }
}

export class InvalidIntegrityIssueInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIntegrityIssueInputError';
  }
}

export const AUTO_RESOLVABLE_CATEGORIES: ReadonlySet<IntegrityIssueCategory> = new Set<IntegrityIssueCategory>([
  'DATA_FRESHNESS',
  'DATA_COMPLETENESS',
  'SOURCE_UNVERIFIED',
  'DCF_STALE',
  'HISTORICAL_VALIDATION_LIMITATION',
]);

/**
 * Deliberately separate from AUTO_RESOLVABLE_CATEGORIES above, and
 * deliberately narrow — currently only MARKET_DATA_INTEGRITY, the one
 * category produced solely by checkMarketCapReconciliation's tolerance
 * check. AUTO_RESOLVABLE_CATEGORIES means "the check ran, was checkable,
 * and now passes" (a real verification). This set means something weaker
 * and different: "the check that used to flag this can no longer run at
 * all" (e.g. the market quote and the filing it would compare against are
 * now too far apart to compare reliably) — never a confirmation that the
 * original finding was correct, incorrect, or has been fixed. An issue in
 * one of these categories is auto-CLOSED (status IGNORED, not RESOLVED, and
 * with an honest reason saying exactly that) rather than left OPEN forever
 * once its check stops being able to run — see the second loop in
 * syncIssuesFromFindings. Every other category (FINANCIAL_RECONCILIATION,
 * DCF_MODEL_ERROR, COMPS_MODEL_ERROR, research contradictions, thesis
 * conflicts, etc.) is untouched by this and always requires a human.
 */
export const AUTO_CLOSE_WHEN_UNVERIFIABLE_CATEGORIES: ReadonlySet<IntegrityIssueCategory> = new Set<IntegrityIssueCategory>(['MARKET_DATA_INTEGRITY']);

export interface FindingForIssueSync {
  category: IntegrityIssueCategory;
  severity: IntegrityIssueSeverity;
  datasetType?: IntegrityDatasetType | null;
  description: string;
  source: string;
  dedupeKey: string;
  /** Whether the underlying check currently passes — a passing finding
   * never creates an issue, and may auto-resolve an existing one when its
   * category is safe to. */
  passed: boolean;
}

export interface SyncIssuesResult {
  created: number;
  autoResolved: number;
  /** Issues closed because their check stopped being able to run at all —
   * see AUTO_CLOSE_WHEN_UNVERIFIABLE_CATEGORIES. Always status IGNORED, not
   * RESOLVED — "no longer checkable" is never the same fact as "verified
   * and passed." */
  autoClosedUnverifiable: number;
  /** An existing OPEN/ACKNOWLEDGED issue for the same still-failing finding
   * whose description text changed (e.g. a validation message became more
   * specific) — only `description` is rewritten; status, detectedAt,
   * category, severity, and dedupeKey are all left exactly as they were.
   * Never fires for RESOLVED/IGNORED issues, and never fires when the text
   * is unchanged (no unnecessary write). */
  descriptionUpdated: number;
}

export async function syncIssuesFromFindings(companyId: string, findings: FindingForIssueSync[]): Promise<SyncIssuesResult> {
  let created = 0;
  let autoResolved = 0;
  let autoClosedUnverifiable = 0;
  let descriptionUpdated = 0;

  // A dedupeKey that was OPEN/ACKNOWLEDGED before but is entirely absent
  // from `findings` this run means its check could no longer run at all —
  // a different situation from "ran and now passes" (handled below in the
  // main loop). Only for the narrow, explicitly-listed categories where
  // that's known to be safe; every other category is left exactly as-is,
  // still OPEN, still requiring a human — same as if this block didn't
  // exist.
  const currentDedupeKeys = new Set(findings.map((f) => f.dedupeKey));
  const noLongerProducible = await db.researchIntegrityIssue.findMany({
    where: { companyId, status: { in: ['OPEN', 'ACKNOWLEDGED'] }, category: { in: [...AUTO_CLOSE_WHEN_UNVERIFIABLE_CATEGORIES] } },
  });
  for (const issue of noLongerProducible) {
    if (currentDedupeKeys.has(issue.dedupeKey)) continue; // still actively checked this run — the main loop below handles it
    await db.researchIntegrityIssue.update({
      where: { id: issue.id },
      data: {
        status: 'IGNORED',
        ignoreReason:
          'Automatically closed — the underlying check can no longer verify this (the data needed for comparison is now considered too stale or mismatched to compare reliably). This is not a confirmation that the original finding was correct, incorrect, or has been fixed; a human should still review if the same problem recurs.',
        resolvedAt: new Date(),
      },
    });
    autoClosedUnverifiable += 1;
    await writeAuditLogEntry({ companyId, entityType: 'ResearchIntegrityIssue', entityId: issue.id, action: 'ISSUE_IGNORED', detail: { category: issue.category, dedupeKey: issue.dedupeKey, reason: 'auto-closed-unverifiable' } });
  }

  for (const finding of findings) {
    const existing = await db.researchIntegrityIssue.findUnique({ where: { companyId_dedupeKey: { companyId, dedupeKey: finding.dedupeKey } } });

    if (!finding.passed) {
      if (!existing) {
        const issue = await db.researchIntegrityIssue.create({
          data: {
            companyId,
            category: finding.category,
            severity: finding.severity,
            datasetType: finding.datasetType ?? null,
            description: finding.description,
            source: finding.source,
            dedupeKey: finding.dedupeKey,
            status: 'OPEN',
          },
        });
        created += 1;
        await writeAuditLogEntry({ companyId, entityType: 'ResearchIntegrityIssue', entityId: issue.id, action: 'ISSUE_CREATED', detail: { category: finding.category, severity: finding.severity, description: finding.description } });
      } else if ((existing.status === 'OPEN' || existing.status === 'ACKNOWLEDGED') && existing.description !== finding.description) {
        // Same finding, still failing, still OPEN/ACKNOWLEDGED — only its
        // description text changed (e.g. a validation message became more
        // specific about which input is actually missing). Status,
        // detectedAt, category, severity, and dedupeKey are all left exactly
        // as they were; this is the same detection, not a new one, and it
        // must stay OPEN because the underlying problem is still real and
        // unresolved. A RESOLVED/IGNORED issue is never touched here — the
        // status check above excludes it, same as the rest of this file's
        // "never silently reopen or rewrite" discipline.
        await db.researchIntegrityIssue.update({ where: { id: existing.id }, data: { description: finding.description } });
        descriptionUpdated += 1;
        await writeAuditLogEntry({
          companyId,
          entityType: 'ResearchIntegrityIssue',
          entityId: existing.id,
          action: 'CHECK_RUN',
          detail: { reason: 'description-refreshed', previousDescription: existing.description, newDescription: finding.description },
        });
      }
      // A RESOLVED/IGNORED issue whose problem recurs is left as-is (not
      // automatically reopened) — a documented, narrow scoping decision (see
      // docs/research-integrity.md) rather than a second, competing "was
      // this actually fixed" heuristic.
      continue;
    }

    if (existing && (existing.status === 'OPEN' || existing.status === 'ACKNOWLEDGED') && AUTO_RESOLVABLE_CATEGORIES.has(existing.category)) {
      await db.researchIntegrityIssue.update({
        where: { id: existing.id },
        data: { status: 'RESOLVED', resolution: 'Automatically resolved — the underlying check now passes.', resolvedAt: new Date() },
      });
      autoResolved += 1;
      await writeAuditLogEntry({ companyId, entityType: 'ResearchIntegrityIssue', entityId: existing.id, action: 'ISSUE_AUTO_RESOLVED', detail: { category: existing.category } });
    }
  }

  return { created, autoResolved, autoClosedUnverifiable, descriptionUpdated };
}

export interface ListIntegrityIssuesFilters {
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'IGNORED';
  category?: IntegrityIssueCategory;
  severity?: IntegrityIssueSeverity;
  datasetType?: IntegrityDatasetType;
}

export async function listIntegrityIssues(companyId: string, filters: ListIntegrityIssuesFilters = {}): Promise<ResearchIntegrityIssue[]> {
  return db.researchIntegrityIssue.findMany({
    where: { companyId, status: filters.status ?? undefined, category: filters.category ?? undefined, severity: filters.severity ?? undefined, datasetType: filters.datasetType ?? undefined },
    orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
  });
}

export async function listAllOpenIntegrityIssues(filters: ListIntegrityIssuesFilters = {}): Promise<(ResearchIntegrityIssue & { company: { ticker: string; name: string } })[]> {
  return db.researchIntegrityIssue.findMany({
    where: { status: filters.status ?? { in: ['OPEN', 'ACKNOWLEDGED'] }, category: filters.category ?? undefined, severity: filters.severity ?? undefined, datasetType: filters.datasetType ?? undefined },
    include: { company: { select: { ticker: true, name: true } } },
    orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
  });
}

export async function getIntegrityIssue(issueId: string): Promise<ResearchIntegrityIssue> {
  const issue = await db.researchIntegrityIssue.findUnique({ where: { id: issueId } });
  if (!issue) throw new IntegrityIssueNotFoundError();
  return issue;
}

export async function acknowledgeIntegrityIssue(issueId: string, userId: string): Promise<ResearchIntegrityIssue> {
  const issue = await getIntegrityIssue(issueId);
  const updated = await db.researchIntegrityIssue.update({ where: { id: issue.id }, data: { status: 'ACKNOWLEDGED', acknowledgedByUserId: userId, acknowledgedAt: new Date() } });
  await writeAuditLogEntry({ companyId: issue.companyId, entityType: 'ResearchIntegrityIssue', entityId: issue.id, action: 'ISSUE_ACKNOWLEDGED', actorUserId: userId });
  return updated;
}

export async function resolveIntegrityIssue(issueId: string, userId: string, resolution: string): Promise<ResearchIntegrityIssue> {
  const trimmed = resolution.trim();
  if (trimmed.length === 0) throw new InvalidIntegrityIssueInputError('A resolution description is required to resolve an issue.');

  const issue = await getIntegrityIssue(issueId);
  const updated = await db.researchIntegrityIssue.update({ where: { id: issue.id }, data: { status: 'RESOLVED', resolution: trimmed, resolvedByUserId: userId, resolvedAt: new Date() } });
  await writeAuditLogEntry({ companyId: issue.companyId, entityType: 'ResearchIntegrityIssue', entityId: issue.id, action: 'ISSUE_RESOLVED', actorUserId: userId, detail: { resolution: trimmed } });
  return updated;
}

/** Spec section 21 — a reason is REQUIRED whenever an issue is ignored. */
export async function ignoreIntegrityIssue(issueId: string, userId: string, reason: string): Promise<ResearchIntegrityIssue> {
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new InvalidIntegrityIssueInputError('A reason is required to ignore an issue.');

  const issue = await getIntegrityIssue(issueId);
  const updated = await db.researchIntegrityIssue.update({ where: { id: issue.id }, data: { status: 'IGNORED', ignoreReason: trimmed, resolvedByUserId: userId, resolvedAt: new Date() } });
  await writeAuditLogEntry({ companyId: issue.companyId, entityType: 'ResearchIntegrityIssue', entityId: issue.id, action: 'ISSUE_IGNORED', actorUserId: userId, detail: { reason: trimmed } });
  return updated;
}
