import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import {
  createWatchlist,
  DuplicateWatchlistNameError,
  InvalidWatchlistNameError,
  listWatchlists,
} from '@/lib/services/watchlistService';

export const dynamic = 'force-dynamic';

/** GET /api/watchlists — every watchlist belonging to the current user only. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const watchlists = await listWatchlists(user.id);
  return NextResponse.json(watchlists);
}

/** POST /api/watchlists — { name } */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';

  try {
    const watchlist = await createWatchlist(user.id, name);
    return NextResponse.json(watchlist, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidWatchlistNameError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof DuplicateWatchlistNameError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
