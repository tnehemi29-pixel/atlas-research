import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { FilingNotFoundError, getOrCreateFilingAnalysis } from '@/lib/services/secFilingService';
import { SecRateLimitError, SecRequestError } from '@/lib/providers/secEdgar';
import { AI_RATE_LIMIT, checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/** A single AI analysis call over one filing's sections — real, but lighter
 * than full report generation. */
export const maxDuration = 30;

/** GET /api/v1/filings/[filingId]/analysis
 * Returns the filing's stored analysis only — 404 if none has ever been
 * generated. Never triggers an AI call itself (that's what POST is for) —
 * "AI calls should not occur every time a user opens a filing," and a plain
 * GET (e.g. a page load) must stay free. */
export async function GET(_request: Request, { params }: { params: { filingId: string } }) {
  const analysis = await db.filingAnalysis.findUnique({ where: { filingId: params.filingId } });
  if (!analysis) {
    return NextResponse.json({ error: 'No analysis has been generated for this filing yet.' }, { status: 404 });
  }
  return NextResponse.json(analysis);
}

/** POST /api/v1/filings/[filingId]/analysis?regenerate=true
 * Generates (or, with `regenerate=true`, re-generates) the filing's AI
 * analysis. Always returns 200 with the stored analysis row — a failed
 * generation (no API key, a request error) is itself a successfully
 * *recorded* outcome (status: 'FAILED', with `error` explaining why), not
 * an HTTP failure; the client checks `status` to render accordingly, and
 * the original filing/sections remain fully accessible either way. Only a
 * genuinely exceptional condition (bad filingId, SEC itself unreachable
 * while re-processing an unprocessed filing) is a non-200 response.
 * Rate-limited by IP — this route is intentionally public. */
export async function POST(request: NextRequest, { params }: { params: { filingId: string } }) {
  const { allowed, retryAfterSeconds } = checkRateLimit('ai', getClientIp(request), AI_RATE_LIMIT);
  if (!allowed) return rateLimitResponse(retryAfterSeconds, 'Too many analysis requests from this client. Please try again shortly.');

  const regenerate = request.nextUrl.searchParams.get('regenerate') === 'true';

  try {
    const analysis = await getOrCreateFilingAnalysis(params.filingId, { regenerate });
    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof FilingNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SecRateLimitError) {
      return NextResponse.json({ error: 'SEC EDGAR rate limit reached — try again shortly.' }, { status: 429 });
    }
    if (error instanceof SecRequestError) {
      return NextResponse.json({ error: 'SEC EDGAR is unavailable right now.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error while generating the analysis.' }, { status: 500 });
  }
}
