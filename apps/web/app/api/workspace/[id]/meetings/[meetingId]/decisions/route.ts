import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { addResearchMeetingDecision } from '@/lib/services/researchMeetingService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** POST /api/workspace/[id]/meetings/[meetingId]/decisions — { decision } */
export async function POST(request: Request, { params }: { params: { id: string; meetingId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const decision = typeof body?.decision === 'string' ? body.decision : '';

  try {
    const meeting = await addResearchMeetingDecision(user.id, params.id, params.meetingId, decision);
    return NextResponse.json(meeting, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
