import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getThesisChallenges } from '@/lib/services/investmentCaseChallengeService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

/** GET /api/investment-cases/[id]/challenges — live comparison of the
 * case's own BASE-scenario assumptions against current data. An empty array
 * is the common, expected result ("no challenges"), never an error. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const challenges = await getThesisChallenges(user.id, params.id);
    return NextResponse.json(challenges);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
