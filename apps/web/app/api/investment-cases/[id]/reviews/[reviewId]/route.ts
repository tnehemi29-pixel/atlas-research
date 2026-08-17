import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { confirmReview, getReview, InvestmentCaseReviewNotFoundError } from '@/lib/services/investmentCaseReviewService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_OUTCOMES = ['THESIS_VALID', 'NEEDS_MODIFICATION', 'INVALIDATED', 'CONTINUE_MONITORING'];

/** GET /api/investment-cases/[id]/reviews/[reviewId] */
export async function GET(_request: Request, { params }: { params: { id: string; reviewId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const review = await getReview(user.id, params.id, params.reviewId);
    return NextResponse.json(review);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseReviewNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

/** PATCH /api/investment-cases/[id]/reviews/[reviewId] — { outcome, notes? }
 * — the ONLY way a review's outcome is ever set; always an explicit,
 * separate user action. Confirming does NOT itself change the case's
 * decision status — that remains a separate PATCH to the case itself. */
export async function PATCH(request: Request, { params }: { params: { id: string; reviewId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const outcome = typeof body?.outcome === 'string' ? body.outcome : '';
  if (!VALID_OUTCOMES.includes(outcome)) {
    return NextResponse.json({ error: `outcome must be one of: ${VALID_OUTCOMES.join(', ')}` }, { status: 400 });
  }

  try {
    const review = await confirmReview(user.id, params.id, params.reviewId, outcome as never, typeof body?.notes === 'string' ? body.notes : null);
    return NextResponse.json(review);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseReviewNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
