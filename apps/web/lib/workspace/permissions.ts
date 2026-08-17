import type { WorkspaceRole } from '@prisma/client';

/**
 * Milestone 15 spec sections 2 and 26 — the one place a workspace role gets
 * turned into a yes/no permission decision. Pure and DB-free on purpose:
 * every M15 service calls these functions after resolving the caller's
 * actual WorkspaceMember row (never a role claimed by the frontend), so the
 * rules themselves stay unit-testable without a database and there is
 * exactly one place to look when a permission needs to change.
 *
 * "Keep the permission system extensible" (spec section 2) — a single
 * ordered rank, not a matrix per action, so adding a new gated action later
 * is one new one-line function, not a new row in a table.
 */

const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 0,
  ANALYST: 1,
  ADMIN: 2,
  OWNER: 3,
};

function atLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** OWNER/ADMIN only — renaming the workspace, deleting it, changing
 * workspace-level settings. */
export function canManageWorkspace(role: WorkspaceRole): boolean {
  return atLeast(role, 'ADMIN');
}

/** OWNER/ADMIN only — add/remove members, change a member's role. Spec
 * section 28's explicit test: "ANALYST must NOT: Manage workspace members." */
export function canManageMembers(role: WorkspaceRole): boolean {
  return atLeast(role, 'ADMIN');
}

/** ANALYST and above — create a research project, edit its
 * name/description/status, add members/companies to it. */
export function canManageProject(role: WorkspaceRole): boolean {
  return atLeast(role, 'ANALYST');
}

/** OWNER/ADMIN only — assigning a company's coverage owner is a workspace
 * organizational decision, not day-to-day research work. */
export function canAssignCoverage(role: WorkspaceRole): boolean {
  return atLeast(role, 'ADMIN');
}

/** ANALYST and above — create/edit a research task, note, or submit a
 * report for review. Spec section 28's explicit test: "Viewer must NOT:
 * ... Edit analyst research." */
export function canCreateOrEditResearch(role: WorkspaceRole): boolean {
  return atLeast(role, 'ANALYST');
}

/** ANALYST and above — mark an assigned task complete without being its
 * original assignee (e.g. an admin closing a task on someone's behalf). */
export function canManageAnyTask(role: WorkspaceRole): boolean {
  return atLeast(role, 'ANALYST');
}

/** Every workspace member, including VIEWER — spec section 8 only asks
 * that comments stay scoped to workspace members, never that VIEWERs be
 * excluded from the conversation entirely. */
export function canComment(_role: WorkspaceRole): boolean {
  return true;
}

/** ANALYST and above — leave a review section comment or check a checklist
 * item. Not the same as approval (below): a peer analyst can review without
 * being able to approve. */
export function canReviewReport(role: WorkspaceRole): boolean {
  return atLeast(role, 'ANALYST');
}

/** OWNER/ADMIN only. Spec section 9: "Only authorized users can approve
 * research"; spec section 28's explicit test: "Viewer must NOT: Approve
 * reports." Reserved above ANALYST deliberately — approval is a
 * higher-stakes gate than reviewing, matching a real research team's
 * separation between "a peer reviewed this" and "a lead approved this." */
export function canApproveReport(role: WorkspaceRole): boolean {
  return atLeast(role, 'ADMIN');
}

/** OWNER/ADMIN and above — create a research meeting or record its
 * decisions/action items. */
export function canManageMeeting(role: WorkspaceRole): boolean {
  return atLeast(role, 'ANALYST');
}
