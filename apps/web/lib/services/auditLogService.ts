import { Prisma, type AuditLogAction, type AuditLogEntry } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Milestone 14 spec section 23 — the research audit log. Append-only by
 * construction (no update/delete path exists anywhere in this file): "what
 * did Atlas know, when did it know it, and why did it produce this
 * conclusion" only stays answerable if nothing here can be edited after the
 * fact. Every other Milestone 14 service writes here as a side effect of
 * its own action — this module has no opinion about WHAT gets logged, only
 * HOW it's stored and read back.
 */

export interface WriteAuditLogEntryInput {
  companyId?: string | null;
  // Milestone 15 — set on every workspace-scoped action so a workspace's own
  // audit trail can be read without scanning every company-scoped entry.
  workspaceId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: AuditLogAction;
  actorUserId?: string | null;
  detail?: unknown;
}

export async function writeAuditLogEntry(input: WriteAuditLogEntryInput): Promise<AuditLogEntry> {
  return db.auditLogEntry.create({
    data: {
      companyId: input.companyId ?? null,
      workspaceId: input.workspaceId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      detail: (input.detail ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export interface ListAuditLogFilters {
  entityType?: string;
  action?: AuditLogAction;
  limit?: number;
}

export async function listAuditLog(companyId: string, filters: ListAuditLogFilters = {}): Promise<AuditLogEntry[]> {
  return db.auditLogEntry.findMany({
    where: { companyId, entityType: filters.entityType, action: filters.action },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 200,
  });
}

/** Milestone 15 — a workspace's own audit trail, the same read shape as
 * listAuditLog above but keyed by workspaceId instead of companyId. */
export async function listWorkspaceAuditLog(workspaceId: string, filters: ListAuditLogFilters = {}): Promise<AuditLogEntry[]> {
  return db.auditLogEntry.findMany({
    where: { workspaceId, entityType: filters.entityType, action: filters.action },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 200,
  });
}
