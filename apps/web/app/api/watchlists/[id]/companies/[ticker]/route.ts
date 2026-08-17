import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { CompanyNotFoundInWatchlistError, removeCompanyFromWatchlist, WatchlistNotFoundError } from '@/lib/services/watchlistService';

export const dynamic = 'force-dynamic';

/** DELETE /api/watchlists/[id]/companies/[ticker] */
export async function DELETE(_request: Request, { params }: { params: { id: string; ticker: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await removeCompanyFromWatchlist(user.id, params.id, params.ticker);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WatchlistNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof CompanyNotFoundInWatchlistError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
