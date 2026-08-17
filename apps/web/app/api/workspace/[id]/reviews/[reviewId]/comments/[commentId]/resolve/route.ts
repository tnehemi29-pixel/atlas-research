import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { resolveSectionComment } from '@/lib/services/researchReviewService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** POST /api/workspace/[id]/reviews/[reviewId]/comments/[commentId]/resolve — never deletes, only flips OPEN -> RESOLVED. */
export async function POST(_request: Request, { params }: { params: { id: string; reviewId: string; commentId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const comment = await resolveSectionComment(user.id, params.id, params.reviewId, params.commentId);
    return NextResponse.json(comment);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
