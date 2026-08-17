import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { addSectionComment } from '@/lib/services/researchReviewService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** POST /api/workspace/[id]/reviews/[reviewId]/comments — { section, content } */
export async function POST(request: Request, { params }: { params: { id: string; reviewId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const section = typeof body?.section === 'string' ? body.section : '';
  const content = typeof body?.content === 'string' ? body.content : '';

  try {
    const comment = await addSectionComment(user.id, params.id, params.reviewId, { section, content });
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
