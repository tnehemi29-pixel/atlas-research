import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { editHolding, HoldingNotFoundError, InvalidHoldingInputError, removeHolding } from '@/lib/services/portfolioService';

export const dynamic = 'force-dynamic';

/** PATCH /api/portfolio/holdings/[id] — any of { shares, averageCost, purchaseDate, notes } */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const input: Parameters<typeof editHolding>[2] = {};
  if (typeof body?.shares === 'number') input.shares = body.shares;
  if (typeof body?.averageCost === 'number') input.averageCost = body.averageCost;
  if ('purchaseDate' in (body ?? {})) input.purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : null;
  if ('notes' in (body ?? {})) input.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes : null;

  try {
    const holding = await editHolding(user.id, params.id, input);
    return NextResponse.json(holding);
  } catch (error) {
    if (error instanceof HoldingNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof InvalidHoldingInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

/** DELETE /api/portfolio/holdings/[id] */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await removeHolding(user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HoldingNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
