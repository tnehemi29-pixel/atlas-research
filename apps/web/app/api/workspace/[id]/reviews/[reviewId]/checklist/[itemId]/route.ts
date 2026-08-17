import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { setChecklistItemChecked } from '@/lib/services/researchReviewService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** PATCH /api/workspace/[id]/reviews/[reviewId]/checklist/[itemId] — { checked } */
export async function PATCH(request: Request, { params }: { params: { id: string; reviewId: string; itemId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.checked !== 'boolean') return NextResponse.json({ error: 'checked must be a boolean.' }, { status: 400 });

  try {
    const item = await setChecklistItemChecked(user.id, params.id, params.reviewId, params.itemId, body.checked);
    return NextResponse.json(item);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
