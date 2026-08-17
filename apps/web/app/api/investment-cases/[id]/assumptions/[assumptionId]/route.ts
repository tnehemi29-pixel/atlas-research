import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { deleteAssumption, InvestmentCaseAssumptionNotFoundError } from '@/lib/services/investmentCaseAssumptionService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

/** DELETE /api/investment-cases/[id]/assumptions/[assumptionId] */
export async function DELETE(_request: Request, { params }: { params: { id: string; assumptionId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await deleteAssumption(user.id, params.id, params.assumptionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseAssumptionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
