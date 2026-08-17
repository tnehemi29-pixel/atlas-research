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
}

export async function syncIssuesFromFindings(companyId: string, findings: FindingForIssueSync[]): Promise<SyncIssuesResult> {
  let created = 0;
  let autoResolved = 0;

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
      }
      // An existing OPEN/ACKNOWLEDGED issue is left exactly as-is — never
      // silently rewritten. A RESOLVED/IGNORED issue whose problem recurs is
      // also left as-is (not automatically reopened) — a documented, narrow
      // scoping decision (see docs/research-integrity.md) rather than a
      // second, competing "was this actually fixed" heuristic.
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

  return { created, autoResolved };
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
