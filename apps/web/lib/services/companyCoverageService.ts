import type { CompanyCoverage } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/services/workspaceService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';
import { canAssignCoverage } from '@/lib/workspace/permissions';

/**
 * Milestone 15 spec section 4 — "NVDA -> Nehemiah." One current coverage
 * owner per (workspace, company); reassigning updates the existing row
 * (upsert) rather than accumulating history rows, since "who owns this
 * right now" is the only state this table needs to hold — the assignment
 * ACTION is still auditable via AuditLogEntry. Enrichment (last research
 * update, open tasks, open integrity issues, investment case status) lives
 * in coverageDashboardService.ts, which composes this file's plain CRUD
 * with data from other services rather than duplicating it here.
 */

export class InvalidCompanyCoverageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCompanyCoverageInputError';
  }
}

export async function assignCompanyCoverage(userId: string, workspaceId: string, ticker: string, analystUserId: string): Promise<CompanyCoverage> {
  await requireWorkspaceRole(userId, workspaceId, canAssignCoverage, 'You do not have permission to assign coverage in this workspace.');

  const company = await db.company.findUnique({ where: { ticker: ticker.trim().toUpperCase() } });
  if (!company) throw new InvalidCompanyCoverageInputError(`Atlas has no company on record for ticker "${ticker}".`);

  // The analyst being assigned must actually be a member of this workspace
  // - never trust a frontend-supplied user id without checking.
  await requireWorkspaceMember(analystUserId, workspaceId);

  const coverage = await db.companyCoverage.upsert({
    where: { workspaceId_companyId: { workspaceId, companyId: company.id } },
    create: { workspaceId, companyId: company.id, analystUserId },
    update: { analystUserId },
  });

  await writeAuditLogEntry({
    workspaceId,
    companyId: company.id,
    entityType: 'CompanyCoverage',
    entityId: coverage.id,
    action: 'COVERAGE_ASSIGNED',
    actorUserId: userId,
    detail: { ticker: company.ticker, analystUserId },
  });
  return coverage;
}

export async function listCompanyCoverage(userId: string, workspaceId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.companyCoverage.findMany({
    where: { workspaceId },
    include: {
      company: { select: { id: true, ticker: true, name: true, sector: true } },
      analyst: { select: { id: true, name: true, email: true } },
    },
    orderBy: { assignedAt: 'desc' },
  });
}

export async function removeCompanyCoverage(userId: string, workspaceId: string, ticker: string): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, canAssignCoverage, 'You do not have permission to manage coverage in this workspace.');
  const company = await db.company.findUnique({ where: { ticker: ticker.trim().toUpperCase() } });
  if (!company) throw new InvalidCompanyCoverageInputError(`Atlas has no company on record for ticker "${ticker}".`);
  await db.companyCoverage.deleteMany({ where: { workspaceId, companyId: company.id } });
}
