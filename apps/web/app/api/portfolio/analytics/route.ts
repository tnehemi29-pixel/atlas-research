import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getPortfolioAnalytics } from '@/lib/services/portfolioService';

export const dynamic = 'force-dynamic';

/** GET /api/portfolio/analytics — sector/industry allocation, weighted
 * fundamentals, and the DCF/comps valuation monitor for every holding. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const analytics = await getPortfolioAnalytics(user.id);
  return NextResponse.json(analytics);
}
