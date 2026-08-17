import { NextResponse } from 'next/server';
import { CompsTargetNotFoundError, getPeerCandidates } from '@/lib/services/compsDataService';
import { ProviderNotConfiguredError, ProviderRequestError } from '@/lib/providers/fmp';

export const dynamic = 'force-dynamic';

/** GET /api/v1/companies/[ticker]/peer-candidates
 * Ranked, scored peer suggestions — screened from companies already known
 * to Atlas (matching sector/industry) plus FMP's stock-peers endpoint when
 * configured. See lib/comps/peerScoring.ts for the scoring formula. */
export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  try {
    const candidates = await getPeerCandidates(params.ticker);
    return NextResponse.json(candidates);
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
    return NextResponse.json(
      { error: 'Unexpected error while finding comparable companies.' },
      { status: 500 },
    );
  }
}
