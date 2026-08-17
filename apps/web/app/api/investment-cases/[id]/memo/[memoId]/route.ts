import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getMemo, InvestmentMemoNotFoundError } from '@/lib/services/investmentMemoService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

/** GET /api/investment-cases/[id]/memo/[memoId] */
export async function GET(_request: Request, { params }: { params: { id: string; memoId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const memo = await getMemo(user.id, params.id, params.memoId);
    return NextResponse.json(memo);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentMemoNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
