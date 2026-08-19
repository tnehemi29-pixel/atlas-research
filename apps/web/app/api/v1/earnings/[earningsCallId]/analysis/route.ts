import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { EarningsCallNotFoundError, getOrCreateEarningsAnalysis } from '@/lib/services/earningsCallService';
import { AI_RATE_LIMIT, checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/** A single AI analysis call over one earnings call's transcript. */
export const maxDuration = 30;

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
 * remains fully accessible either way.
 * Rate-limited by IP — this route is intentionally public. */
export async function POST(request: NextRequest, { params }: { params: { earningsCallId: string } }) {
  const { allowed, retryAfterSeconds } = checkRateLimit('ai', getClientIp(request), AI_RATE_LIMIT);
  if (!allowed) return rateLimitResponse(retryAfterSeconds, 'Too many analysis requests from this client. Please try again shortly.');

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
