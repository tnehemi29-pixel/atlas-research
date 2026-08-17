import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { addHolding, DuplicateHoldingError, InvalidHoldingInputError } from '@/lib/services/portfolioService';

export const dynamic = 'force-dynamic';

/** POST /api/portfolio/holdings — { ticker, shares, averageCost, purchaseDate?, notes? } */
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
  const shares = typeof body?.shares === 'number' ? body.shares : NaN;
  const averageCost = typeof body?.averageCost === 'number' ? body.averageCost : NaN;
  const purchaseDate = typeof body?.purchaseDate === 'string' && body.purchaseDate ? new Date(body.purchaseDate) : null;
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes : null;

  if (!ticker.trim()) return NextResponse.json({ error: 'A ticker is required.' }, { status: 400 });

  try {
    const holding = await addHolding(user.id, { ticker, shares, averageCost, purchaseDate, notes });
    return NextResponse.json(holding, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidHoldingInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof DuplicateHoldingError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
