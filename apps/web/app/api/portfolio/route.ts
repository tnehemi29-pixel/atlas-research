import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getPortfolioDetail } from '@/lib/services/portfolioService';

export const dynamic = 'force-dynamic';

/** GET /api/portfolio — the current user's (auto-created, if needed)
 * default portfolio: summary totals + every holding's row data. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const detail = await getPortfolioDetail(user.id);
  return NextResponse.json(detail);
}
