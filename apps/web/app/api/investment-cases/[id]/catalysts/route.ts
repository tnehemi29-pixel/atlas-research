import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createCatalyst, listCatalysts } from '@/lib/services/investmentCaseCatalystService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];
const VALID_STATUSES = ['UPCOMING', 'IN_PROGRESS', 'OCCURRED', 'FAILED', 'UNCERTAIN'];

/** GET /api/investment-cases/[id]/catalysts */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const catalysts = await listCatalysts(user.id, params.id);
    return NextResponse.json(catalysts);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** POST /api/investment-cases/[id]/catalysts — { catalyst, timeframe, evidence?, potentialImpact, status? } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const potentialImpact = typeof body?.potentialImpact === 'string' ? body.potentialImpact : '';
  if (!VALID_LEVELS.includes(potentialImpact)) {
    return NextResponse.json({ error: `potentialImpact must be one of: ${VALID_LEVELS.join(', ')}` }, { status: 400 });
  }
  const status = typeof body?.status === 'string' ? body.status : undefined;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }
  const catalyst = typeof body?.catalyst === 'string' ? body.catalyst : '';
  const timeframe = typeof body?.timeframe === 'string' ? body.timeframe : '';
  if (!catalyst || !timeframe) return NextResponse.json({ error: 'catalyst and timeframe are required.' }, { status: 400 });

  try {
    const created = await createCatalyst(user.id, params.id, {
      catalyst,
      timeframe,
      evidence: typeof body?.evidence === 'string' ? body.evidence : null,
      potentialImpact: potentialImpact as never,
      status: status as never,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
