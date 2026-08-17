import { NextRequest, NextResponse } from 'next/server';
import { CompsTargetNotFoundError, fetchTargetAndPeers } from '@/lib/services/compsDataService';
import { ProviderNotConfiguredError, ProviderRequestError } from '@/lib/providers/fmp';

export const dynamic = 'force-dynamic';

function parseTickerList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((ticker) => ticker.trim())
    .filter(Boolean);
}

/** GET /api/v1/companies/[ticker]/comps?peers=A,B,C
 * Raw data only — the target's and each requested peer's
 * CompanyValuationMetrics snapshot. No multiples or statistics are computed
 * here; the client runs lib/comps/engine.ts itself (see CompsWorkspace) so
 * toggling a peer in/out recomputes instantly without a round trip. */
export async function GET(request: NextRequest, { params }: { params: { ticker: string } }) {
  const peerTickers = parseTickerList(request.nextUrl.searchParams.get('peers'));

  try {
    const result = await fetchTargetAndPeers(params.ticker, peerTickers);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CompsTargetNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: 'Company data is temporarily unavailable.' }, { status: 503 });
    }
    if (error instanceof ProviderRequestError) {
      return NextResponse.json({ error: 'Data provider is unavailable right now.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error while loading comps data.' }, { status: 500 });
  }
}
