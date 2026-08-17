import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getInvalidationEvaluations } from '@/lib/services/investmentCaseChallengeService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

/** GET /api/investment-cases/[id]/invalidation-evaluations — advisory only;
 * never writes InvestmentCaseInvalidationCriterion.status itself. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const evaluations = await getInvalidationEvaluations(user.id, params.id);
    return NextResponse.json(evaluations);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
