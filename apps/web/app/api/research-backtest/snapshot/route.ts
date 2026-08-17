import { NextRequest, NextResponse } from 'next/server';
import { getSnapshotAsOf } from '@/lib/services/historicalSnapshotService';

export const dynamic = 'force-dynamic';

/** GET /api/research-backtest/snapshot?ticker=X&asOfDate=YYYY-MM-DD
 * "What Atlas knew" at a historical date (spec section 2) — filings,
 * earnings calls, research events, financials, price, and DCF, each
 * filtered to information available on or before `asOfDate`. */
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker');
  const asOfDate = request.nextUrl.searchParams.get('asOfDate');
  if (!ticker || !asOfDate) {
    return NextResponse.json({ error: 'ticker and asOfDate query parameters are required.' }, { status: 400 });
  }

  const snapshot = await getSnapshotAsOf(ticker, asOfDate);
  if (!snapshot) return NextResponse.json({ error: `Unknown ticker "${ticker}".` }, { status: 404 });
  return NextResponse.json(snapshot);
}
