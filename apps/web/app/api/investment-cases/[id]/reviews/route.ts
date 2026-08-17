import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { listReviews, startReview } from '@/lib/services/investmentCaseReviewService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['QUARTERLY', 'AD_HOC'];

/** GET /api/investment-cases/[id]/reviews */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const reviews = await listReviews(user.id, params.id);
    return NextResponse.json(reviews);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** POST /api/investment-cases/[id]/reviews — { type: 'QUARTERLY' | 'AD_HOC' }
 * — always creates the review row up front with outcome: null; the summary
 * assembled here is read-only until the user separately confirms it via
 * PATCH .../reviews/[reviewId]. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const type = typeof body?.type === 'string' ? body.type : '';
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }

  try {
    const review = await startReview(user.id, params.id, type as never);
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
