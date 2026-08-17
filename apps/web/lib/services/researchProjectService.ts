import type { ResearchProject, ResearchProjectStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/services/workspaceService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';
import { canManageProject } from '@/lib/workspace/permissions';

/**
 * Milestone 15 spec section 3 — Research Projects. `getOwnedWorkspaceProject`
 * mirrors every prior ownership choke point in this codebase
 * (getOwnedInvestmentCase, getOwnedWatchlist): a project id that exists but
 * belongs to a DIFFERENT workspace collapses into the identical
 * ResearchProjectNotFoundError as one that doesn't exist at all, so a
 * project id can never be used to probe cross-workspace existence.
 */

export class ResearchProjectNotFoundError extends Error {
  constructor(message = 'Research project not found.') {
    super(message);
    this.name = 'ResearchProjectNotFoundError';
  }
}

export class InvalidResearchProjectInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResearchProjectInputError';
  }
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvalidResearchProjectInputError(`${field} cannot be empty.`);
  return trimmed;
}

export async function getOwnedWorkspaceProject(workspaceId: string, projectId: string): Promise<ResearchProject> {
  const project = await db.researchProject.findUnique({ where: { id: projectId } });
  if (!project || project.workspaceId !== workspaceId) throw new ResearchProjectNotFoundError();
  return project;
}

export interface CreateResearchProjectInput {
  name: string;
  description?: string;
  status?: ResearchProjectStatus;
  ownerUserId?: string;
}

export async function createResearchProject(userId: string, workspaceId: string, input: CreateResearchProjectInput): Promise<ResearchProject> {
  await requireWorkspaceRole(userId, workspaceId, canManageProject, 'You do not have permission to create research projects in this workspace.');
  const name = assertNonEmpty(input.name, 'Name');

  const ownerUserId = input.ownerUserId ?? userId;
  if (ownerUserId !== userId) {
    // The owner must actually be a member of this workspace - never trust a
    // frontend-supplied owner id without checking.
    await requireWorkspaceMember(ownerUserId, workspaceId);
  }

  const project = await db.researchProject.create({
    data: { workspaceId, name, description: input.description?.trim() || null, status: input.status ?? 'PLANNED', ownerUserId },
  });

  await writeAuditLogEntry({ workspaceId, entityType: 'ResearchProject', entityId: project.id, action: 'PROJECT_CREATED', actorUserId: userId, detail: { name, status: project.status } });
  return project;
}

export interface ListResearchProjectsFilters {
  status?: ResearchProjectStatus;
}

export async function listResearchProjects(userId: string, workspaceId: string, filters: ListResearchProjectsFilters = {}) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.researchProject.findMany({
    where: { workspaceId, status: filters.status },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { companies: true, reports: true, investmentCases: true, tasks: true, members: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getResearchProjectDetail(userId: string, workspaceId: string, projectId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  const project = await getOwnedWorkspaceProject(workspaceId, projectId);
  return db.researchProject.findUniqueOrThrow({
    where: { id: project.id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      companies: { include: { company: { select: { id: true, ticker: true, name: true, sector: true } } } },
      reports: { select: { id: true, version: true, reviewStatus: true, companyId: true, createdAt: true } },
      investmentCases: { select: { id: true, status: true, companyId: true, userId: true, createdAt: true } },
      tasks: { select: { id: true, title: true, status: true, priority: true, dueDate: true } },
      _count: { select: { notes: true } },
    },
  });
}

export interface UpdateResearchProjectInput {
  name?: string;
  description?: string | null;
  status?: ResearchProjectStatus;
  ownerUserId?: string;
}

export async function updateResearchProject(userId: string, workspaceId: string, projectId: string, input: UpdateResearchProjectInput): Promise<ResearchProject> {
  await requireWorkspaceRole(userId, workspaceId, canManageProject, 'You do not have permission to edit research projects in this workspace.');
  const project = await getOwnedWorkspaceProject(workspaceId, projectId);

  if (input.ownerUserId && input.ownerUserId !== project.ownerUserId) {
    await requireWorkspaceMember(input.ownerUserId, workspaceId);
  }

  const updated = await db.researchProject.update({
    where: { id: project.id },
    data: {
      name: input.name !== undefined ? assertNonEmpty(input.name, 'Name') : undefined,
      description: input.description !== undefined ? input.description?.trim() || null : undefined,
      status: input.status,
      ownerUserId: input.ownerUserId,
    },
  });

  await writeAuditLogEntry({ workspaceId, entityType: 'ResearchProject', entityId: updated.id, action: 'PROJECT_UPDATED', actorUserId: userId, detail: { status: updated.status } });
  return updated;
}

export async function addResearchProjectMember(userId: string, workspaceId: string, projectId: string, memberUserId: string): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, canManageProject, 'You do not have permission to manage this project.');
  const project = await getOwnedWorkspaceProject(workspaceId, projectId);
  await requireWorkspaceMember(memberUserId, workspaceId);

  await db.researchProjectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: memberUserId } },
    create: { projectId: project.id, userId: memberUserId },
    update: {},
  });
}

export async function removeResearchProjectMember(userId: string, workspaceId: string, projectId: string, memberUserId: string): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, canManageProject, 'You do not have permission to manage this project.');
  const project = await getOwnedWorkspaceProject(workspaceId, projectId);
  await db.researchProjectMember.deleteMany({ where: { projectId: project.id, userId: memberUserId } });
}

/** `ticker` is looked up, never created — assigning a company to a project
 * should never silently mint a phantom Company row for a typo. */
export async function addResearchProjectCompany(userId: string, workspaceId: string, projectId: string, ticker: string): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, canManageProject, 'You do not have permission to manage this project.');
  const project = await getOwnedWorkspaceProject(workspaceId, projectId);

  const company = await db.company.findUnique({ where: { ticker: ticker.trim().toUpperCase() } });
  if (!company) throw new InvalidResearchProjectInputError(`Atlas has no company on record for ticker "${ticker}".`);

  await db.researchProjectCompany.upsert({
    where: { projectId_companyId: { projectId: project.id, companyId: company.id } },
    create: { projectId: project.id, companyId: company.id },
    update: {},
  });
}

export async function removeResearchProjectCompany(userId: string, workspaceId: string, projectId: string, companyId: string): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, canManageProject, 'You do not have permission to manage this project.');
  const project = await getOwnedWorkspaceProject(workspaceId, projectId);
  await db.researchProjectCompany.deleteMany({ where: { projectId: project.id, companyId } });
}
