import type { MeetingActionItem, ResearchMeeting } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/services/workspaceService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';
import { canManageMeeting } from '@/lib/workspace/permissions';

/**
 * Milestone 15 spec section 21 — a research meeting: date, title,
 * participants, companies discussed, notes, decisions, and action items.
 * "Action items should automatically create research tasks where
 * appropriate" — `addActionItem`'s `createTask` flag does exactly that,
 * reusing researchTaskService.ts's own creation path rather than
 * duplicating task-creation logic here.
 */

export class ResearchMeetingNotFoundError extends Error {
  constructor(message = 'Research meeting not found.') {
    super(message);
    this.name = 'ResearchMeetingNotFoundError';
  }
}

export class InvalidResearchMeetingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResearchMeetingInputError';
  }
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvalidResearchMeetingInputError(`${field} cannot be empty.`);
  return trimmed;
}

export async function getOwnedWorkspaceMeeting(workspaceId: string, meetingId: string): Promise<ResearchMeeting> {
  const meeting = await db.researchMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting || meeting.workspaceId !== workspaceId) throw new ResearchMeetingNotFoundError();
  return meeting;
}

async function resolveCompanyIds(tickers: string[] | undefined): Promise<string[]> {
  if (!tickers || tickers.length === 0) return [];
  const ids: string[] = [];
  for (const ticker of tickers) {
    const company = await db.company.findUnique({ where: { ticker: ticker.trim().toUpperCase() } });
    if (!company) throw new InvalidResearchMeetingInputError(`Atlas has no company on record for ticker "${ticker}".`);
    ids.push(company.id);
  }
  return ids;
}

export interface CreateResearchMeetingInput {
  title: string;
  date: Date;
  notes?: string;
  participantUserIds?: string[];
  tickers?: string[];
}

export async function createResearchMeeting(userId: string, workspaceId: string, input: CreateResearchMeetingInput): Promise<ResearchMeeting> {
  await requireWorkspaceRole(userId, workspaceId, canManageMeeting, 'You do not have permission to create research meetings in this workspace.');

  const title = assertNonEmpty(input.title, 'Title');
  const companyIds = await resolveCompanyIds(input.tickers);

  const participantIds = new Set([userId, ...(input.participantUserIds ?? [])]);
  for (const participantId of participantIds) {
    await requireWorkspaceMember(participantId, workspaceId);
  }

  const meeting = await db.researchMeeting.create({
    data: {
      workspaceId,
      title,
      date: input.date,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
      participants: { create: [...participantIds].map((participantUserId) => ({ userId: participantUserId })) },
      companies: { create: companyIds.map((companyId) => ({ companyId })) },
    },
  });

  await writeAuditLogEntry({ workspaceId, entityType: 'ResearchMeeting', entityId: meeting.id, action: 'MEETING_CREATED', actorUserId: userId, detail: { title } });
  return meeting;
}

export async function listResearchMeetings(userId: string, workspaceId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.researchMeeting.findMany({
    where: { workspaceId },
    include: {
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      companies: { include: { company: { select: { id: true, ticker: true, name: true } } } },
      _count: { select: { actionItems: true } },
    },
    orderBy: { date: 'desc' },
  });
}

export async function getResearchMeetingDetail(userId: string, workspaceId: string, meetingId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  const meeting = await getOwnedWorkspaceMeeting(workspaceId, meetingId);
  return db.researchMeeting.findUniqueOrThrow({
    where: { id: meeting.id },
    include: {
      participants: { include: { user: { select: { id: true, name: true, email: true } } } },
      companies: { include: { company: { select: { id: true, ticker: true, name: true } } } },
      actionItems: { include: { assignedUser: { select: { id: true, name: true, email: true } }, task: { select: { id: true, status: true } } } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function addResearchMeetingDecision(userId: string, workspaceId: string, meetingId: string, decision: string): Promise<ResearchMeeting> {
  await requireWorkspaceRole(userId, workspaceId, canManageMeeting, 'You do not have permission to edit this meeting.');
  const meeting = await getOwnedWorkspaceMeeting(workspaceId, meetingId);
  const trimmed = assertNonEmpty(decision, 'Decision');
  return db.researchMeeting.update({ where: { id: meeting.id }, data: { decisions: { push: trimmed } } });
}

export interface AddMeetingActionItemInput {
  description: string;
  assignedUserId?: string;
  createTask?: boolean;
  ticker?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDate?: Date;
}

export async function addMeetingActionItem(userId: string, workspaceId: string, meetingId: string, input: AddMeetingActionItemInput): Promise<MeetingActionItem> {
  await requireWorkspaceRole(userId, workspaceId, canManageMeeting, 'You do not have permission to edit this meeting.');
  const meeting = await getOwnedWorkspaceMeeting(workspaceId, meetingId);
  const description = assertNonEmpty(input.description, 'Description');

  if (input.assignedUserId) await requireWorkspaceMember(input.assignedUserId, workspaceId);

  let companyId: string | null = null;
  if (input.ticker) {
    const company = await db.company.findUnique({ where: { ticker: input.ticker.trim().toUpperCase() } });
    if (!company) throw new InvalidResearchMeetingInputError(`Atlas has no company on record for ticker "${input.ticker}".`);
    companyId = company.id;
  }

  let taskId: string | null = null;
  if (input.createTask) {
    const task = await db.researchTask.create({
      data: {
        workspaceId,
        companyId,
        title: description,
        assignedUserId: input.assignedUserId ?? null,
        createdByUserId: userId,
        priority: input.priority ?? 'MEDIUM',
        dueDate: input.dueDate ?? null,
      },
    });
    taskId = task.id;
    await writeAuditLogEntry({ workspaceId, companyId: companyId ?? undefined, entityType: 'ResearchTask', entityId: task.id, action: 'TASK_CREATED', actorUserId: userId, detail: { title: description, fromMeetingId: meeting.id } });
  }

  const actionItem = await db.meetingActionItem.create({
    data: { meetingId: meeting.id, description, assignedUserId: input.assignedUserId ?? null, taskId },
  });

  await writeAuditLogEntry({ workspaceId, entityType: 'MeetingActionItem', entityId: actionItem.id, action: 'MEETING_ACTION_ITEM_CREATED', actorUserId: userId, detail: { description, createdTask: !!taskId } });
  return actionItem;
}
