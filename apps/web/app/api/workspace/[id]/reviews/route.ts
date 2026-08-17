import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { listWorkspaceReviews, submitReportForReview } from '@/lib/services/researchReviewService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** GET /api/workspace/[id]/reviews?pendingOnly=true */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const pendingOnly = new URL(request.url).searchParams.get('pendingOnly') === 'true';
  try {
    const reviews = await listWorkspaceReviews(user.id, params.id, { pendingOnly });
    return NextResponse.json(reviews);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** POST /api/workspace/[id]/reviews — { reportId }. Submits a DRAFT report for review, seeding the checklist. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const reportId = typeof body?.reportId === 'string' ? body.reportId : '';

  try {
    const review = await submitReportForReview(user.id, params.id, reportId);
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
