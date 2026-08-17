import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { reorderWatchlistCompanies, WatchlistNotFoundError } from '@/lib/services/watchlistService';

export const dynamic = 'force-dynamic';

/** POST /api/watchlists/[id]/reorder — { tickers: string[] } in the desired display order. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const tickers = Array.isArray(body?.tickers) ? body.tickers.filter((t: unknown): t is string => typeof t === 'string') : null;
  if (!tickers) return NextResponse.json({ error: 'tickers must be an array of strings.' }, { status: 400 });

  try {
    await reorderWatchlistCompanies(user.id, params.id, tickers);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WatchlistNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
