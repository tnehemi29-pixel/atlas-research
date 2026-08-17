import { NextRequest, NextResponse } from 'next/server';
import type { ResearchEventCategory } from '@prisma/client';
import { getCompanyTimeline } from '@/lib/services/researchEventFeedService';

export const dynamic = 'force-dynamic';

const CATEGORIES: ResearchEventCategory[] = ['SEC_FILING', 'EARNINGS', 'FINANCIAL', 'VALUATION', 'CORPORATE_EVENT'];

/** GET /api/companies/[ticker]/timeline?category= — every research event
 * detected for this company, global data (no auth required, matches every
 * other company sub-page). */
export async function GET(request: NextRequest, { params }: { params: { ticker: string } }) {
  const categoryParam = request.nextUrl.searchParams.get('category');
  const category = CATEGORIES.find((c) => c === categoryParam);

  const timeline = await getCompanyTimeline(params.ticker, { category });
  return NextResponse.json(timeline);
}
