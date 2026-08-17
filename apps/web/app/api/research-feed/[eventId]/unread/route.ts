import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { markResearchEventUnread } from '@/lib/services/researchEventFeedService';

export const dynamic = 'force-dynamic';

/** POST /api/research-feed/[eventId]/unread — marks the event unread for
 * the current user only; never affects any other user's read state. */
export async function POST(_request: Request, { params }: { params: { eventId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await markResearchEventUnread(user.id, params.eventId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return NextResponse.json({ error: 'Research event not found.' }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
