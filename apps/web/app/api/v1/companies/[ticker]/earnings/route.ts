import { NextResponse } from 'next/server';
import { CompanyEarningsNotFoundError, listEarningsCalls } from '@/lib/services/earningsCallService';
import { SecRateLimitError, SecRequestError } from '@/lib/providers/secEdgar';

export const dynamic = 'force-dynamic';

/** GET /api/v1/companies/[ticker]/earnings
 * The chronological earnings-call feed, derived from the company's own
 * ingested quarterly financial data (see earningsCallService's doc comment
 * for why) — a call's transcript availability is a per-call detail, not
 * something this list endpoint fetches eagerly. */
export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  try {
    const calls = await listEarningsCalls(params.ticker);
    return NextResponse.json(calls);
  } catch (error) {
    if (error instanceof CompanyEarningsNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SecRateLimitError) {
      return NextResponse.json({ error: 'SEC EDGAR rate limit reached — try again shortly.' }, { status: 429 });
    }
    if (error instanceof SecRequestError) {
      return NextResponse.json({ error: 'SEC EDGAR is unavailable right now.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error while loading earnings calls.' }, { status: 500 });
  }
}
