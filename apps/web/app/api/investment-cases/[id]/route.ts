import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { deleteInvestmentCase, getInvestmentCaseDetail, InvalidInvestmentCaseInputError, InvestmentCaseNotFoundError, updateInvestmentCase } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['RESEARCHING', 'WATCHLIST', 'ACTIVE_THESIS', 'UNDER_REVIEW', 'THESIS_CHALLENGED', 'THESIS_INVALIDATED', 'ARCHIVED'];

/** GET /api/investment-cases/[id] — 404s identically whether the id doesn't
 * exist or isn't owned by the current user. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const investmentCase = await getInvestmentCaseDetail(user.id, params.id);
    return NextResponse.json(investmentCase);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** PATCH /api/investment-cases/[id] — any subset of the case's editable
 * fields, including `status` (the DecisionStatus) — always an explicit
 * user-driven change, never inferred or auto-applied by the AI. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (body?.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const investmentCase = await updateInvestmentCase(user.id, params.id, {
      horizon: typeof body?.horizon === 'string' ? body.horizon : undefined,
      coreThesis: typeof body?.coreThesis === 'string' ? body.coreThesis : undefined,
      keyDrivers: Array.isArray(body?.keyDrivers) ? body.keyDrivers.filter((d: unknown) => typeof d === 'string') : undefined,
      status: body?.status,
      bullSummary: body?.bullSummary === null || typeof body?.bullSummary === 'string' ? body.bullSummary : undefined,
      baseSummary: body?.baseSummary === null || typeof body?.baseSummary === 'string' ? body.baseSummary : undefined,
      bearSummary: body?.bearSummary === null || typeof body?.bearSummary === 'string' ? body.bearSummary : undefined,
      strengthenIndicators: Array.isArray(body?.strengthenIndicators) ? body.strengthenIndicators.filter((d: unknown) => typeof d === 'string') : undefined,
      weakenIndicators: Array.isArray(body?.weakenIndicators) ? body.weakenIndicators.filter((d: unknown) => typeof d === 'string') : undefined,
      invalidateIndicators: Array.isArray(body?.invalidateIndicators) ? body.invalidateIndicators.filter((d: unknown) => typeof d === 'string') : undefined,
    });
    return NextResponse.json(investmentCase);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof InvalidInvestmentCaseInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

/** DELETE /api/investment-cases/[id] */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await deleteInvestmentCase(user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
