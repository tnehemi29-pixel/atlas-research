import { NextResponse } from 'next/server';
import type { TaskPriority, TaskStatus } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createResearchTask, listResearchTasks } from '@/lib/services/researchTaskService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

const VALID_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];

/** GET /api/workspace/[id]/tasks?status=&priority=&assignedUserId=&companyId=&projectId= */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  if (status && !VALID_STATUSES.includes(status as TaskStatus)) return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  if (priority && !VALID_PRIORITIES.includes(priority as TaskPriority)) return NextResponse.json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` }, { status: 400 });

  try {
    const tasks = await listResearchTasks(user.id, params.id, {
      status: status as TaskStatus | undefined,
      priority: priority as TaskPriority | undefined,
      assignedUserId: url.searchParams.get('assignedUserId') ?? undefined,
      companyId: url.searchParams.get('companyId') ?? undefined,
      projectId: url.searchParams.get('projectId') ?? undefined,
    });
    return NextResponse.json(tasks);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** POST /api/workspace/[id]/tasks — { title, description?, ticker?, projectId?, assignedUserId?, priority?, status?, dueDate? } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title : '';
  if (body?.priority !== undefined && !VALID_PRIORITIES.includes(body.priority as TaskPriority)) return NextResponse.json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` }, { status: 400 });
  if (body?.status !== undefined && !VALID_STATUSES.includes(body.status as TaskStatus)) return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });

  try {
    const task = await createResearchTask(user.id, params.id, {
      title,
      description: typeof body?.description === 'string' ? body.description : undefined,
      ticker: typeof body?.ticker === 'string' ? body.ticker : undefined,
      projectId: typeof body?.projectId === 'string' ? body.projectId : undefined,
      assignedUserId: typeof body?.assignedUserId === 'string' ? body.assignedUserId : undefined,
      priority: body?.priority,
      status: body?.status,
      dueDate: typeof body?.dueDate === 'string' ? new Date(body.dueDate) : undefined,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
