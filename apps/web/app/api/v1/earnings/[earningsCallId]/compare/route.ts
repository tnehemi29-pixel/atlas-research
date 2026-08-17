import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  EarningsCallNotFoundError,
  findPreviousEarningsCall,
  getOrCreateEarningsComparison,
} from '@/lib/services/earningsCallService';

export const dynamic = 'force-dynamic';

async function resolvePreviousCallId(earningsCallId: string, explicitPreviousId: string | null): Promise<string | null> {
  if (explicitPreviousId) return explicitPreviousId;

  const call = await db.earningsCall.findUnique({ where: { id: earningsCallId } });
  if (!call) return null;
  const previous = await findPreviousEarningsCall(call);
  return previous?.id ?? null;
}

/** GET /api/v1/earnings/[earningsCallId]/compare?with=[previousEarningsCallId]
 * Returns the stored comparison only — 404 if none exists yet. `with` is
 * optional; omitted, it resolves to the immediately preceding quarter's call. */
export async function GET(request: NextRequest, { params }: { params: { earningsCallId: string } }) {
  const previousEarningsCallId = await resolvePreviousCallId(params.earningsCallId, request.nextUrl.searchParams.get('with'));
  if (!previousEarningsCallId) {
    return NextResponse.json({ error: 'No prior quarter\'s call was found to compare against.' }, { status: 404 });
  }

  const comparison = await db.earningsComparison.findUnique({
    where: { earningsCallId_previousEarningsCallId: { earningsCallId: params.earningsCallId, previousEarningsCallId } },
  });
  if (!comparison) {
    return NextResponse.json({ error: 'No comparison has been generated yet.' }, { status: 404 });
  }
  return NextResponse.json(comparison);
}

/** POST /api/v1/earnings/[earningsCallId]/compare?with=[previousEarningsCallId]&regenerate=true
 * Generates (or regenerates) the comparison. Always 200s with the stored
 * row — a failed AI comparison is still a successfully recorded outcome;
 * the deterministic financial-changes and guidance-summary blocks are
 * present either way. */
export async function POST(request: NextRequest, { params }: { params: { earningsCallId: string } }) {
  const regenerate = request.nextUrl.searchParams.get('regenerate') === 'true';
  const previousEarningsCallId = await resolvePreviousCallId(params.earningsCallId, request.nextUrl.searchParams.get('with'));
  if (!previousEarningsCallId) {
    return NextResponse.json({ error: 'No prior quarter\'s call was found to compare against.' }, { status: 404 });
  }

  try {
    const comparison = await getOrCreateEarningsComparison(params.earningsCallId, previousEarningsCallId, { regenerate });
    return NextResponse.json(comparison);
  } catch (error) {
    if (error instanceof EarningsCallNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unexpected error while generating the comparison.' }, { status: 500 });
  }
}
