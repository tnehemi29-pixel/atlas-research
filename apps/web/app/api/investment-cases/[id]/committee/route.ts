import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getCommitteeReviewDetail } from '@/lib/services/committeeReviewService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** GET /api/investment-cases/[id]/committee — visible to the case owner, or
 * to a workspace member of the case's linked project once it has actually
 * been submitted for committee review (never before). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const detail = await getCommitteeReviewDetail(user.id, params.id);
    return NextResponse.json(detail);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
