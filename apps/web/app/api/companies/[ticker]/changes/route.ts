import { NextResponse } from 'next/server';
import { getCompanyRecentChanges } from '@/lib/services/researchEventFeedService';

export const dynamic = 'force-dynamic';

/** GET /api/companies/[ticker]/changes — the trimmed, most-recent research
 * events behind the company page's "Recent Changes" panel. */
export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  const changes = await getCompanyRecentChanges(params.ticker);
  return NextResponse.json(changes);
}
