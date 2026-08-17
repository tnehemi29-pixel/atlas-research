import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { approveReview } from '@/lib/services/researchReviewService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** POST /api/workspace/[id]/reviews/[reviewId]/approve — OWNER/ADMIN only, requires a complete checklist and no open comments. */
export async function POST(_request: Request, { params }: { params: { id: string; reviewId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const review = await approveReview(user.id, params.id, params.reviewId);
    return NextResponse.json(review);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
