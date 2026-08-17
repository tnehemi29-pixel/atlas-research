import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { deleteEvidence, InvestmentCaseEvidenceNotFoundError } from '@/lib/services/investmentCaseEvidenceService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

/** DELETE /api/investment-cases/[id]/evidence/[evidenceId] */
export async function DELETE(_request: Request, { params }: { params: { id: string; evidenceId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await deleteEvidence(user.id, params.id, params.evidenceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseEvidenceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
