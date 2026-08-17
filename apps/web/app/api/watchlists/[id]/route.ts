import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import {
  deleteWatchlist,
  DuplicateWatchlistNameError,
  getWatchlistDetail,
  InvalidWatchlistNameError,
  renameWatchlist,
  WatchlistNotFoundError,
} from '@/lib/services/watchlistService';

export const dynamic = 'force-dynamic';

/** GET /api/watchlists/[id] — the watchlist plus every row's enriched
 * fundamentals/DCF snapshot. 404s identically whether the id doesn't exist
 * or simply isn't owned by the current user. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const detail = await getWatchlistDetail(user.id, params.id);
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof WatchlistNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** PATCH /api/watchlists/[id] — { name } to rename. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
    const watchlist = await renameWatchlist(user.id, params.id, name);
    return NextResponse.json(watchlist);
  } catch (error) {
    if (error instanceof WatchlistNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof InvalidWatchlistNameError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof DuplicateWatchlistNameError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

/** DELETE /api/watchlists/[id] */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await deleteWatchlist(user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WatchlistNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
