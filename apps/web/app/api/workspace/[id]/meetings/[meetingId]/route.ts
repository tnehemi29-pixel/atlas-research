import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getResearchMeetingDetail } from '@/lib/services/researchMeetingService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** GET /api/workspace/[id]/meetings/[meetingId] */
export async function GET(_request: Request, { params }: { params: { id: string; meetingId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const meeting = await getResearchMeetingDetail(user.id, params.id, params.meetingId);
    return NextResponse.json(meeting);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
