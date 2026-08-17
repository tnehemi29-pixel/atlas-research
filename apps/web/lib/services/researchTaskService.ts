import type { ResearchTask, TaskPriority, TaskStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceRole, WorkspaceForbiddenError } from '@/lib/services/workspaceService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';
import { canCreateOrEditResearch } from '@/lib/workspace/permissions';

/**
 * Milestone 15 spec section 5 — a structured RESEARCH task, deliberately not
 * a general-purpose to-do system: every task lives inside a workspace and
 * may optionally be tied to a company and/or project, but there is no
 * generic "board," no sub-tasks, no arbitrary custom fields.
 */

export class ResearchTaskNotFoundError extends Error {
  constructor(message = 'Research task not found.') {
    super(message);
    this.name = 'ResearchTaskNotFoundError';
  }
}

export class InvalidResearchTaskInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResearchTaskInputError';
  }
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvalidResearchTaskInputError(`${field} cannot be empty.`);
  return trimmed;
}

export async function getOwnedWorkspaceTask(workspaceId: string, taskId: string): Promise<ResearchTask> {
  const task = await db.researchTask.findUnique({ where: { id: taskId } });
  if (!task || task.workspaceId !== workspaceId) throw new ResearchTaskNotFoundError();
  return task;
}

async function resolveCompanyId(ticker: string | undefined): Promise<string | null> {
  if (!ticker) return null;
  const company = await db.company.findUnique({ where: { ticker: ticker.trim().toUpperCase() } });
  if (!company) throw new InvalidResearchTaskInputError(`Atlas has no company on record for ticker "${ticker}".`);
  return company.id;
}

async function resolveProjectId(workspaceId: string, projectId: string | undefined): Promise<string | null> {
  if (!projectId) return null;
  const project = await db.researchProject.findUnique({ where: { id: projectId } });
  if (!project || project.workspaceId !== workspaceId) throw new InvalidResearchTaskInputError('That project does not exist in this workspace.');
  return project.id;
}

export interface CreateResearchTaskInput {
  title: string;
  description?: string;
  ticker?: string;
  projectId?: string;
  assignedUserId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: Date;
}

export async function createResearchTask(userId: string, workspaceId: string, input: CreateResearchTaskInput): Promise<ResearchTask> {
  await requireWorkspaceRole(userId, workspaceId, canCreateOrEditResearch, 'You do not have permission to create research tasks in this workspace.');

  const title = assertNonEmpty(input.title, 'Title');
  const companyId = await resolveCompanyId(input.ticker);
  const projectId = await resolveProjectId(workspaceId, input.projectId);

  if (input.assignedUserId) await requireWorkspaceMember(input.assignedUserId, workspaceId);

  const task = await db.researchTask.create({
    data: {
      workspaceId,
      companyId,
      projectId,
      title,
      description: input.description?.trim() || null,
      assignedUserId: input.assignedUserId ?? null,
      createdByUserId: userId,
      priority: input.priority ?? 'MEDIUM',
      status: input.status ?? 'TODO',
      dueDate: input.dueDate ?? null,
    },
  });

  await writeAuditLogEntry({ workspaceId, companyId: companyId ?? undefined, entityType: 'ResearchTask', entityId: task.id, action: 'TASK_CREATED', actorUserId: userId, detail: { title, priority: task.priority } });
  if (task.assignedUserId) {
    await writeAuditLogEntry({ workspaceId, entityType: 'ResearchTask', entityId: task.id, action: 'TASK_ASSIGNED', actorUserId: userId, detail: { assignedUserId: task.assignedUserId } });
  }
  return task;
}

export interface ListResearchTasksFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedUserId?: string;
  companyId?: string;
  projectId?: string;
}

export async function listResearchTasks(userId: string, workspaceId: string, filters: ListResearchTasksFilters = {}) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.researchTask.findMany({
    where: { workspaceId, status: filters.status, priority: filters.priority, assignedUserId: filters.assignedUserId, companyId: filters.companyId, projectId: filters.projectId },
    include: {
      company: { select: { id: true, ticker: true, name: true } },
      project: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getResearchTaskDetail(userId: string, workspaceId: string, taskId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  const task = await getOwnedWorkspaceTask(workspaceId, taskId);
  return db.researchTask.findUniqueOrThrow({
    where: { id: task.id },
    include: {
      company: { select: { id: true, ticker: true, name: true } },
      project: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export interface UpdateResearchTaskInput {
  title?: string;
  description?: string | null;
  assignedUserId?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: Date | null;
}

/** Any ANALYST+ member can edit, and so can the task's own assignee even if
 * their role alone wouldn't otherwise permit it (e.g. completing their own
 * task) — the one deliberate exception to the flat role gate. */
export async function updateResearchTask(userId: string, workspaceId: string, taskId: string, input: UpdateResearchTaskInput): Promise<ResearchTask> {
  const member = await requireWorkspaceMember(userId, workspaceId);
  const task = await getOwnedWorkspaceTask(workspaceId, taskId);

  const isAssignee = task.assignedUserId === userId;
  if (!canCreateOrEditResearch(member.role) && !isAssignee) {
    throw new WorkspaceForbiddenError('You do not have permission to edit this task.');
  }

  if (input.assignedUserId) await requireWorkspaceMember(input.assignedUserId, workspaceId);

  const nowCompleting = input.status === 'COMPLETED' && task.status !== 'COMPLETED';
  const updated = await db.researchTask.update({
    where: { id: task.id },
    data: {
      title: input.title !== undefined ? assertNonEmpty(input.title, 'Title') : undefined,
      description: input.description !== undefined ? input.description?.trim() || null : undefined,
      assignedUserId: input.assignedUserId,
      priority: input.priority,
      status: input.status,
      dueDate: input.dueDate,
      completedAt: nowCompleting ? new Date() : input.status && input.status !== 'COMPLETED' ? null : undefined,
    },
  });

  if (input.assignedUserId && input.assignedUserId !== task.assignedUserId) {
    await writeAuditLogEntry({ workspaceId, entityType: 'ResearchTask', entityId: task.id, action: 'TASK_ASSIGNED', actorUserId: userId, detail: { assignedUserId: input.assignedUserId } });
  }
  if (nowCompleting) {
    await writeAuditLogEntry({ workspaceId, entityType: 'ResearchTask', entityId: task.id, action: 'TASK_COMPLETED', actorUserId: userId });
  }
  return updated;
}
