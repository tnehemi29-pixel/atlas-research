import { NextRequest, NextResponse } from 'next/server';
import type { MaterialityLevel, ResearchEventCategory } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getResearchFeed } from '@/lib/services/researchEventFeedService';

export const dynamic = 'force-dynamic';

const MATERIALITY_LEVELS: MaterialityLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CATEGORIES: ResearchEventCategory[] = ['SEC_FILING', 'EARNINGS', 'FINANCIAL', 'VALUATION', 'CORPORATE_EVENT'];

/** GET /api/research-feed?minMateriality=&category=&unreadOnly= — Milestone
 * 11's personalized, DB-backed research-event feed, scoped to the current
 * user's followed companies (watchlists + portfolio + saved research). */
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const minMaterialityParam = request.nextUrl.searchParams.get('minMateriality');
  const categoryParam = request.nextUrl.searchParams.get('category');
  const unreadOnly = request.nextUrl.searchParams.get('unreadOnly') === 'true';

  const minMateriality = MATERIALITY_LEVELS.find((m) => m === minMaterialityParam);
  const category = CATEGORIES.find((c) => c === categoryParam);

  const feed = await getResearchFeed(user.id, { minMateriality, category, unreadOnly });
  return NextResponse.json(feed);
}
