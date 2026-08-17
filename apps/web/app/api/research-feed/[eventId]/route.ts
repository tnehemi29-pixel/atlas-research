import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getResearchEventDetail } from '@/lib/services/researchEventFeedService';

export const dynamic = 'force-dynamic';

/** GET /api/research-feed/[eventId] — full event detail (changes, deterministic
 * impacts, sources with resolved hrefs, AI narrative if any). Events are
 * global (shared by every user who follows the company) — only `isRead` is
 * scoped to the current user. */
export async function GET(_request: Request, { params }: { params: { eventId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const detail = await getResearchEventDetail(user.id, params.eventId);
  if (!detail) return NextResponse.json({ error: 'Research event not found.' }, { status: 404 });
  return NextResponse.json(detail);
}
