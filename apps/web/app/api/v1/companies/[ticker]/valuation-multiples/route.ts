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

/** GET /api/v1/companies/[ticker]/valuation-multiples?peers=A,B,C&excluded=D
 * Runs the same lib/comps/engine.ts the UI runs client-side, server-side —
 * demonstrating the calculation engine is a genuinely isomorphic, reusable
 * module, and giving a directly-consumable multiples table for anyone
 * calling the API rather than using the app. */
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
      target: result.target,
      targetMultiples: result.targetMultiples,
      peers: result.peers,
      statistics: result.statistics,
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
    return NextResponse.json({ error: 'Unexpected error while computing valuation multiples.' }, { status: 500 });
  }
}
