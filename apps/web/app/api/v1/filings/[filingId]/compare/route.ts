import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { FilingNotFoundError, findPreviousFiling, getOrCreateFilingComparison } from '@/lib/services/secFilingService';
import { SecRateLimitError, SecRequestError } from '@/lib/providers/secEdgar';
import { AI_RATE_LIMIT, checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/** A single AI comparison call over two filings' sections. */
export const maxDuration = 30;

async function resolvePreviousFilingId(filingId: string, explicitPreviousId: string | null): Promise<string | null> {
  if (explicitPreviousId) return explicitPreviousId;

  const filing = await db.secFiling.findUnique({ where: { id: filingId } });
  if (!filing) return null;
  const previous = await findPreviousFiling(filing);
  return previous?.id ?? null;
}

/** GET /api/v1/filings/[filingId]/compare?with=[previousFilingId]
 * Returns the stored comparison only — 404 if none exists yet. `with` is
 * optional; omitted, it resolves to the most recent prior filing of the
 * same type ("2025 10-K vs. 2024 10-K"). */
export async function GET(request: NextRequest, { params }: { params: { filingId: string } }) {
  const previousFilingId = await resolvePreviousFilingId(params.filingId, request.nextUrl.searchParams.get('with'));
  if (!previousFilingId) {
    return NextResponse.json({ error: 'No prior filing of the same type was found to compare against.' }, { status: 404 });
  }

  const comparison = await db.filingComparison.findUnique({
    where: { filingId_previousFilingId: { filingId: params.filingId, previousFilingId } },
  });
  if (!comparison) {
    return NextResponse.json({ error: 'No comparison has been generated yet.' }, { status: 404 });
  }
  return NextResponse.json(comparison);
}

/** POST /api/v1/filings/[filingId]/compare?with=[previousFilingId]&regenerate=true
 * Generates (or regenerates) the comparison. Like the analysis route,
 * always 200s with the stored row — a failed AI comparison is still a
 * successfully recorded outcome; the deterministic financial-changes block
 * is present either way.
 * Rate-limited by IP — this route is intentionally public. */
export async function POST(request: NextRequest, { params }: { params: { filingId: string } }) {
  const { allowed, retryAfterSeconds } = checkRateLimit('ai', getClientIp(request), AI_RATE_LIMIT);
  if (!allowed) return rateLimitResponse(retryAfterSeconds, 'Too many comparison requests from this client. Please try again shortly.');

  const regenerate = request.nextUrl.searchParams.get('regenerate') === 'true';
  const previousFilingId = await resolvePreviousFilingId(params.filingId, request.nextUrl.searchParams.get('with'));
  if (!previousFilingId) {
    return NextResponse.json({ error: 'No prior filing of the same type was found to compare against.' }, { status: 404 });
  }

  try {
    const comparison = await getOrCreateFilingComparison(params.filingId, previousFilingId, { regenerate });
    return NextResponse.json(comparison);
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
    return NextResponse.json({ error: 'Unexpected error while generating the comparison.' }, { status: 500 });
  }
}
