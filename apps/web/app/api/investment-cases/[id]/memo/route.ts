import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { generateInvestmentMemo, listMemos } from '@/lib/services/investmentMemoService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

/** GET /api/investment-cases/[id]/memo — every memo ever generated for this case. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const memos = await listMemos(user.id, params.id);
    return NextResponse.json(memos);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** POST /api/investment-cases/[id]/memo — always creates a fresh version
 * snapshot first, then generates the 16-section memo from it. On AI
 * failure, the memo is still persisted with status FAILED and all 14
 * deterministic sections populated (see investmentMemoService.ts). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const memo = await generateInvestmentMemo(user.id, params.id);
    return NextResponse.json(memo, { status: 201 });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
