import type { Workspace, WorkspaceMember, WorkspaceRole } from '@prisma/client';
import { db } from '@/lib/db';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';
import { canManageMembers } from '@/lib/workspace/permissions';

/**
 * Milestone 15 spec section 26 — every workspace request must verify
 * User -> Workspace Membership -> Role -> Resource Permission. This file is
 * the ONE place that resolves the first two steps: `requireWorkspaceMember`
 * and `requireWorkspaceRole` are the shared choke point every other M15
 * service imports rather than re-querying WorkspaceMember independently, the
 * same discipline `getOwnedInvestmentCase` (Milestone 13) and
 * `getOwnedWatchlist` (Milestone 10) established for per-user ownership.
 *
 * "Doesn't exist" and "you're not a member" collapse into the identical
 * WorkspaceNotFoundError (-> 404) so a workspace id can never be probed to
 * leak its existence — the same discipline used throughout this codebase.
 * WorkspaceForbiddenError (-> 403) is reserved for the case where the
 * caller IS a member but their role doesn't permit the action — they
 * already know the resource exists, so there's nothing left to hide.
 */

export class WorkspaceNotFoundError extends Error {
  constructor(message = 'Workspace not found.') {
    super(message);
    this.name = 'WorkspaceNotFoundError';
  }
}

export class WorkspaceForbiddenError extends Error {
  constructor(message = 'You do not have permission to perform this action in this workspace.') {
    super(message);
    this.name = 'WorkspaceForbiddenError';
  }
}

export class InvalidWorkspaceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWorkspaceInputError';
  }
}

export class WorkspaceMemberNotFoundError extends Error {
  constructor(message = 'That user is not a member of this workspace.') {
    super(message);
    this.name = 'WorkspaceMemberNotFoundError';
  }
}

/** Resolves the caller's own membership row, or throws WorkspaceNotFoundError
 * — used by every M15 service before doing anything else. */
export async function requireWorkspaceMember(userId: string, workspaceId: string): Promise<WorkspaceMember> {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!member) throw new WorkspaceNotFoundError();
  return member;
}

/** Resolves membership AND checks a role predicate (from lib/workspace/
 * permissions.ts) in one call — the standard shape every M15 write
 * operation starts with. */
export async function requireWorkspaceRole(userId: string, workspaceId: string, check: (role: WorkspaceRole) => boolean, message?: string): Promise<WorkspaceMember> {
  const member = await requireWorkspaceMember(userId, workspaceId);
  if (!check(member.role)) throw new WorkspaceForbiddenError(message);
  return member;
}

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvalidWorkspaceInputError(`${field} cannot be empty.`);
  return trimmed;
}

export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
}

/** Creating a workspace always makes the creator its first OWNER — there is
 * no path to a workspace with zero owners. */
export async function createWorkspace(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
  const name = assertNonEmpty(input.name, 'Name');
  const slug = normalizeSlug(input.slug && input.slug.trim().length > 0 ? input.slug : name);
  if (slug.length === 0) throw new InvalidWorkspaceInputError('Could not derive a valid slug from that name.');

  const existing = await db.workspace.findUnique({ where: { slug } });
  if (existing) throw new InvalidWorkspaceInputError(`A workspace with the slug "${slug}" already exists.`);

  const workspace = await db.workspace.create({
    data: { name, slug, createdByUserId: userId, members: { create: { userId, role: 'OWNER' } } },
  });

  await writeAuditLogEntry({ workspaceId: workspace.id, entityType: 'Workspace', entityId: workspace.id, action: 'WORKSPACE_CREATED', actorUserId: userId, detail: { name, slug } });
  return workspace;
}

export async function listUserWorkspaces(userId: string): Promise<(Workspace & { role: WorkspaceRole })[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { joinedAt: 'asc' },
  });
  return memberships.map((m) => ({ ...m.workspace, role: m.role }));
}

export async function getWorkspaceDetail(userId: string, workspaceId: string) {
  const member = await requireWorkspaceMember(userId, workspaceId);
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  return { ...workspace, myRole: member.role };
}

export async function listWorkspaceMembers(userId: string, workspaceId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  });
}

export interface AddWorkspaceMemberInput {
  email: string;
  role?: WorkspaceRole;
}

export async function addWorkspaceMember(userId: string, workspaceId: string, input: AddWorkspaceMemberInput): Promise<WorkspaceMember> {
  await requireWorkspaceRole(userId, workspaceId, canManageMembers, 'Only workspace owners and admins can add members.');

  const email = assertNonEmpty(input.email, 'Email').toLowerCase();
  const targetUser = await db.user.findUnique({ where: { email } });
  if (!targetUser) throw new InvalidWorkspaceInputError('No Atlas user was found with that email.');

  const existing = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: targetUser.id } } });
  if (existing) throw new InvalidWorkspaceInputError('That user is already a member of this workspace.');

  const member = await db.workspaceMember.create({ data: { workspaceId, userId: targetUser.id, role: input.role ?? 'ANALYST' } });
  await writeAuditLogEntry({ workspaceId, entityType: 'WorkspaceMember', entityId: member.id, action: 'MEMBER_ADDED', actorUserId: userId, detail: { addedUserId: targetUser.id, role: member.role } });
  return member;
}

async function assertNotRemovingLastOwner(workspaceId: string, member: WorkspaceMember, nextRole: WorkspaceRole | null): Promise<void> {
  if (member.role !== 'OWNER' || nextRole === 'OWNER') return;
  const ownerCount = await db.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } });
  if (ownerCount <= 1) throw new InvalidWorkspaceInputError('A workspace must always have at least one owner.');
}

export async function removeWorkspaceMember(userId: string, workspaceId: string, targetUserId: string): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, canManageMembers, 'Only workspace owners and admins can remove members.');

  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: targetUserId } } });
  if (!member) throw new WorkspaceMemberNotFoundError();
  await assertNotRemovingLastOwner(workspaceId, member, null);

  await db.workspaceMember.delete({ where: { id: member.id } });
  await writeAuditLogEntry({ workspaceId, entityType: 'WorkspaceMember', entityId: member.id, action: 'MEMBER_REMOVED', actorUserId: userId, detail: { removedUserId: targetUserId } });
}

export async function changeWorkspaceMemberRole(userId: string, workspaceId: string, targetUserId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
  await requireWorkspaceRole(userId, workspaceId, canManageMembers, 'Only workspace owners and admins can change member roles.');

  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: targetUserId } } });
  if (!member) throw new WorkspaceMemberNotFoundError();
  await assertNotRemovingLastOwner(workspaceId, member, role);

  const updated = await db.workspaceMember.update({ where: { id: member.id }, data: { role } });
  await writeAuditLogEntry({ workspaceId, entityType: 'WorkspaceMember', entityId: member.id, action: 'MEMBER_ROLE_CHANGED', actorUserId: userId, detail: { targetUserId, previousRole: member.role, newRole: role } });
  return updated;
}
