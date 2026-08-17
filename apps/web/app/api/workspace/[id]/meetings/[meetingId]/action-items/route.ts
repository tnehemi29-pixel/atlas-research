import { NextResponse } from 'next/server';
import type { TaskPriority } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { addMeetingActionItem } from '@/lib/services/researchMeetingService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

const VALID_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** POST /api/workspace/[id]/meetings/[meetingId]/action-items — { description, assignedUserId?, createTask?, ticker?, priority?, dueDate? } */
export async function POST(request: Request, { params }: { params: { id: string; meetingId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const description = typeof body?.description === 'string' ? body.description : '';
  if (body?.priority !== undefined && !VALID_PRIORITIES.includes(body.priority as TaskPriority)) return NextResponse.json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` }, { status: 400 });

  try {
    const actionItem = await addMeetingActionItem(user.id, params.id, params.meetingId, {
      description,
      assignedUserId: typeof body?.assignedUserId === 'string' ? body.assignedUserId : undefined,
      createTask: body?.createTask === true,
      ticker: typeof body?.ticker === 'string' ? body.ticker : undefined,
      priority: body?.priority,
      dueDate: typeof body?.dueDate === 'string' ? new Date(body.dueDate) : undefined,
    });
    return NextResponse.json(actionItem, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
