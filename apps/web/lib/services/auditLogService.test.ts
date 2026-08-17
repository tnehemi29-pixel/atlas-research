import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { listAuditLog, listWorkspaceAuditLog, writeAuditLogEntry } from './auditLogService';

const TICKER = 'ZZALS1';
const WORKSPACE_EMAIL = 'zz-audit-log-test@example.com';

async function cleanup() {
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) await db.auditLogEntry.deleteMany({ where: { companyId: company.id } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
  await db.workspace.deleteMany({ where: { slug: 'zz-audit-log-test' } });
  await db.user.deleteMany({ where: { email: WORKSPACE_EMAIL } });
}

describe('auditLogService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('writes an entry and reads it back', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Audit Log Test Co.' } });
    const entry = await writeAuditLogEntry({ companyId: company.id, entityType: 'ResearchIntegrityIssue', entityId: 'issue-1', action: 'ISSUE_CREATED', detail: { severity: 'HIGH' } });
    expect(entry.id).toBeTruthy();

    const log = await listAuditLog(company.id);
    expect(log).toHaveLength(1);
    expect(log[0]!.action).toBe('ISSUE_CREATED');
  });

  it('returns entries newest-first', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Audit Log Test Co.' } });
    await writeAuditLogEntry({ companyId: company.id, entityType: 'X', action: 'CHECK_RUN' });
    await writeAuditLogEntry({ companyId: company.id, entityType: 'X', action: 'ISSUE_CREATED' });

    const log = await listAuditLog(company.id);
    expect(log[0]!.action).toBe('ISSUE_CREATED');
    expect(log[1]!.action).toBe('CHECK_RUN');
  });

  it('filters by entityType and action', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Audit Log Test Co.' } });
    await writeAuditLogEntry({ companyId: company.id, entityType: 'ResearchClaim', action: 'CLAIM_CREATED' });
    await writeAuditLogEntry({ companyId: company.id, entityType: 'ResearchIntegrityIssue', action: 'ISSUE_CREATED' });

    const claimsOnly = await listAuditLog(company.id, { entityType: 'ResearchClaim' });
    expect(claimsOnly).toHaveLength(1);
    expect(claimsOnly[0]!.entityType).toBe('ResearchClaim');
  });

  it('supports entries with no companyId (a global/system-level entry)', async () => {
    const entry = await writeAuditLogEntry({ entityType: 'System', action: 'CHECK_RUN' });
    expect(entry.companyId).toBeNull();
    await db.auditLogEntry.delete({ where: { id: entry.id } });
  });

  it('Milestone 15 - writes and reads back workspace-scoped entries, kept separate from company-scoped ones', async () => {
    const passwordHash = await hashPassword('irrelevant');
    const user = await db.user.create({ data: { email: WORKSPACE_EMAIL, passwordHash } });
    const workspace = await db.workspace.create({ data: { name: 'Audit Log Test Workspace', slug: 'zz-audit-log-test', createdByUserId: user.id } });

    await writeAuditLogEntry({ workspaceId: workspace.id, entityType: 'Workspace', entityId: workspace.id, action: 'WORKSPACE_CREATED', actorUserId: user.id });
    await writeAuditLogEntry({ workspaceId: workspace.id, entityType: 'ResearchTask', action: 'TASK_CREATED', actorUserId: user.id });

    const log = await listWorkspaceAuditLog(workspace.id);
    expect(log).toHaveLength(2);
    expect(log.every((entry) => entry.companyId === null)).toBe(true);
    expect(log[0]!.action).toBe('TASK_CREATED');
  });
});
