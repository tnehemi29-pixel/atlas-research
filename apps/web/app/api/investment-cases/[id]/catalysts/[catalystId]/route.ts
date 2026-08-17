import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { deleteCatalyst, InvestmentCaseCatalystNotFoundError, updateCatalyst } from '@/lib/services/investmentCaseCatalystService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];
const VALID_STATUSES = ['UPCOMING', 'IN_PROGRESS', 'OCCURRED', 'FAILED', 'UNCERTAIN'];

/** PATCH /api/investment-cases/[id]/catalysts/[catalystId] */
export async function PATCH(request: Request, { params }: { params: { id: string; catalystId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (body?.potentialImpact !== undefined && !VALID_LEVELS.includes(body.potentialImpact)) {
    return NextResponse.json({ error: `potentialImpact must be one of: ${VALID_LEVELS.join(', ')}` }, { status: 400 });
  }
  if (body?.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const updated = await updateCatalyst(user.id, params.id, params.catalystId, {
      catalyst: typeof body?.catalyst === 'string' ? body.catalyst : undefined,
      timeframe: typeof body?.timeframe === 'string' ? body.timeframe : undefined,
      evidence: body?.evidence === null || typeof body?.evidence === 'string' ? body.evidence : undefined,
      potentialImpact: body?.potentialImpact,
      status: body?.status,
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseCatalystNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

/** DELETE /api/investment-cases/[id]/catalysts/[catalystId] */
export async function DELETE(_request: Request, { params }: { params: { id: string; catalystId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await deleteCatalyst(user.id, params.id, params.catalystId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseCatalystNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
