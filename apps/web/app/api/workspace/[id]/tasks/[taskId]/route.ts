import { NextResponse } from 'next/server';
import type { TaskPriority, TaskStatus } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getResearchTaskDetail, updateResearchTask } from '@/lib/services/researchTaskService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

const VALID_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];

/** GET /api/workspace/[id]/tasks/[taskId] */
export async function GET(_request: Request, { params }: { params: { id: string; taskId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const task = await getResearchTaskDetail(user.id, params.id, params.taskId);
    return NextResponse.json(task);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** PATCH /api/workspace/[id]/tasks/[taskId] — { title?, description?, assignedUserId?, priority?, status?, dueDate? } */
export async function PATCH(request: Request, { params }: { params: { id: string; taskId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (body?.priority !== undefined && !VALID_PRIORITIES.includes(body.priority as TaskPriority)) return NextResponse.json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` }, { status: 400 });
  if (body?.status !== undefined && !VALID_STATUSES.includes(body.status as TaskStatus)) return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });

  try {
    const task = await updateResearchTask(user.id, params.id, params.taskId, {
      title: typeof body?.title === 'string' ? body.title : undefined,
      description: body?.description === null ? null : typeof body?.description === 'string' ? body.description : undefined,
      assignedUserId: body?.assignedUserId === null ? null : typeof body?.assignedUserId === 'string' ? body.assignedUserId : undefined,
      priority: body?.priority,
      status: body?.status,
      dueDate: body?.dueDate === null ? null : typeof body?.dueDate === 'string' ? new Date(body.dueDate) : undefined,
    });
    return NextResponse.json(task);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
