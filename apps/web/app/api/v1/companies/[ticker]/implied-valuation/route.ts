import { NextRequest, NextResponse } from 'next/server';
import { runComps } from '@/lib/comps/engine';
import type { PeerSelection } from '@/lib/comps/types';
import { CompsTargetNotFoundError, fetchTargetAndPeers } from '@/lib/services/compsDataService';
import { ProviderNotConfiguredError, ProviderRequestError } from '@/lib/providers/fmp';

export const dynamic = 'force-dynamic';

function parseTickerList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
}

/** GET /api/v1/companies/[ticker]/implied-valuation?peers=A,B,C&excluded=D
 * Just the valuation-summary slice of the comps engine's output: implied
 * share price per methodology (using the outlier-adjusted peer median),
 * the median across meaningful methodologies, and peer-quality context. */
export async function GET(request: NextRequest, { params }: { params: { ticker: string } }) {
  const peerTickers = parseTickerList(request.nextUrl.searchParams.get('peers'));
  const excludedTickers = new Set(parseTickerList(request.nextUrl.searchParams.get('excluded')));

  try {
    const { target, peers, failedTickers } = await fetchTargetAndPeers(params.ticker, peerTickers);

    const peerSelections: PeerSelection[] = peers.map((metrics) => ({
      metrics,
      score: null,
      source: 'user',
      excluded: excludedTickers.has(metrics.ticker),
    }));

    const result = runComps({ target, peers: peerSelections });

    return NextResponse.json({
      impliedValuation: result.impliedValuation,
      medianImpliedSharePrice: result.medianImpliedSharePrice,
      currentSharePrice: result.target.price,
      peerQuality: result.peerQuality,
      failedTickers,
    });
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
    return NextResponse.json({ error: 'Unexpected error while computing implied valuation.' }, { status: 500 });
  }
}
