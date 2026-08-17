import { NextResponse } from 'next/server';
import type { CommitteeReactionType } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { addCommitteeReaction } from '@/lib/services/committeeReviewService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

const VALID_REACTIONS: CommitteeReactionType[] = ['SUPPORT', 'CONCERN', 'QUESTION'];

/** POST /api/investment-cases/[id]/committee/reactions — { reactionType, content? }.
 * A reaction only, never translated into an automatic recommendation. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.reactionType !== 'string' || !VALID_REACTIONS.includes(body.reactionType as CommitteeReactionType)) {
    return NextResponse.json({ error: `reactionType must be one of: ${VALID_REACTIONS.join(', ')}` }, { status: 400 });
  }

  try {
    const reaction = await addCommitteeReaction(user.id, params.id, { reactionType: body.reactionType as CommitteeReactionType, content: typeof body?.content === 'string' ? body.content : undefined });
    return NextResponse.json(reaction, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
