import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { EarningsCallNotFoundError, getOrCreateEarningsAnalysis } from '@/lib/services/earningsCallService';

export const dynamic = 'force-dynamic';

/** GET /api/v1/earnings/[earningsCallId]/analysis
 * Returns the call's stored analysis only — 404 if none has ever been
 * generated. Never triggers an AI call itself (that's what POST is for) —
 * a plain GET (e.g. a page load) must stay free. */
export async function GET(_request: Request, { params }: { params: { earningsCallId: string } }) {
  const analysis = await db.earningsAnalysis.findUnique({ where: { earningsCallId: params.earningsCallId } });
  if (!analysis) {
    return NextResponse.json({ error: 'No analysis has been generated for this call yet.' }, { status: 404 });
  }
  return NextResponse.json(analysis);
}

/** POST /api/v1/earnings/[earningsCallId]/analysis?regenerate=true
 * Generates (or, with `regenerate=true`, re-generates) the call's AI
 * analysis. Always returns 200 with the stored analysis row — a failed
 * generation is itself a successfully *recorded* outcome (status: 'FAILED',
 * with `error` explaining why), not an HTTP failure; the original transcript
 * remains fully accessible either way. */
export async function POST(request: NextRequest, { params }: { params: { earningsCallId: string } }) {
  const regenerate = request.nextUrl.searchParams.get('regenerate') === 'true';

  try {
    const analysis = await getOrCreateEarningsAnalysis(params.earningsCallId, { regenerate });
    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof EarningsCallNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unexpected error while generating the analysis.' }, { status: 500 });
  }
}
