import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createResearchMeeting, listResearchMeetings } from '@/lib/services/researchMeetingService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** GET /api/workspace/[id]/meetings */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const meetings = await listResearchMeetings(user.id, params.id);
    return NextResponse.json(meetings);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** POST /api/workspace/[id]/meetings — { title, date, notes?, participantUserIds?, tickers? } */
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
  const date = typeof body?.date === 'string' ? new Date(body.date) : null;
  if (!date || Number.isNaN(date.getTime())) return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 });

  try {
    const meeting = await createResearchMeeting(user.id, params.id, {
      title,
      date,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
      participantUserIds: Array.isArray(body?.participantUserIds) ? body.participantUserIds.filter((id: unknown): id is string => typeof id === 'string') : undefined,
      tickers: Array.isArray(body?.tickers) ? body.tickers.filter((t: unknown): t is string => typeof t === 'string') : undefined,
    });
    return NextResponse.json(meeting, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
