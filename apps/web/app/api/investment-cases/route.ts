import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createInvestmentCase, InvalidInvestmentCaseInputError, listInvestmentCases } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['RESEARCHING', 'WATCHLIST', 'ACTIVE_THESIS', 'UNDER_REVIEW', 'THESIS_CHALLENGED', 'THESIS_INVALIDATED', 'ARCHIVED'];

/** GET /api/investment-cases — every case belonging to the current user only. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const cases = await listInvestmentCases(user.id);
  return NextResponse.json(cases);
}

/** POST /api/investment-cases — { ticker, horizon, coreThesis, keyDrivers?, status? } */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const ticker = typeof body?.ticker === 'string' ? body.ticker : '';
  const horizon = typeof body?.horizon === 'string' ? body.horizon : '';
  const coreThesis = typeof body?.coreThesis === 'string' ? body.coreThesis : '';
  const keyDrivers = Array.isArray(body?.keyDrivers) ? body.keyDrivers.filter((d: unknown) => typeof d === 'string') : undefined;
  const status = typeof body?.status === 'string' ? body.status : undefined;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const investmentCase = await createInvestmentCase(user.id, { ticker, horizon, coreThesis, keyDrivers, status: status as never });
    return NextResponse.json(investmentCase, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidInvestmentCaseInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
