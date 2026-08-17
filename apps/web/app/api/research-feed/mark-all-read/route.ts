import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { markAllResearchEventsRead } from '@/lib/services/researchEventFeedService';

export const dynamic = 'force-dynamic';

/** POST /api/research-feed/mark-all-read — marks every event across the
 * current user's followed companies as read; scoped to that user only. */
export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const markedCount = await markAllResearchEventsRead(user.id);
  return NextResponse.json({ markedCount });
}
