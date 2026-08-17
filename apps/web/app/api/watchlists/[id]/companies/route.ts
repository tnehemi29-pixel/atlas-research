import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { addCompanyToWatchlist, DuplicateWatchlistCompanyError, WatchlistNotFoundError } from '@/lib/services/watchlistService';

export const dynamic = 'force-dynamic';

/** POST /api/watchlists/[id]/companies — { ticker } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const ticker = typeof body?.ticker === 'string' ? body.ticker : '';
  if (!ticker.trim()) return NextResponse.json({ error: 'A ticker is required.' }, { status: 400 });

  try {
    const entry = await addCompanyToWatchlist(user.id, params.id, ticker);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof WatchlistNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof DuplicateWatchlistCompanyError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
