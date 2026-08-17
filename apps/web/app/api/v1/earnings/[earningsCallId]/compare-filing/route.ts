import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  EarningsCallNotFoundError,
  findMatchingSecFiling,
  getOrCreateEarningsFilingComparison,
} from '@/lib/services/earningsCallService';
import { FilingNotFoundError } from '@/lib/services/secFilingService';

export const dynamic = 'force-dynamic';

async function resolveSecFilingId(earningsCallId: string, explicitFilingId: string | null): Promise<string | null> {
  if (explicitFilingId) return explicitFilingId;

  const call = await db.earningsCall.findUnique({ where: { id: earningsCallId } });
  if (!call) return null;
  const filing = await findMatchingSecFiling(call.companyId, call);
  return filing?.id ?? null;
}

/** GET /api/v1/earnings/[earningsCallId]/compare-filing?filingId=[secFilingId]
 * Cross-source research: the stored earnings-call-vs-SEC-filing comparison
 * only — 404 if none exists yet. `filingId` is optional; omitted, it
 * resolves to the 10-Q/10-K whose period best matches this call. */
export async function GET(request: NextRequest, { params }: { params: { earningsCallId: string } }) {
  const secFilingId = await resolveSecFilingId(params.earningsCallId, request.nextUrl.searchParams.get('filingId'));
  if (!secFilingId) {
    return NextResponse.json({ error: 'No matching SEC filing was found for this call\'s period.' }, { status: 404 });
  }

  const comparison = await db.earningsFilingComparison.findUnique({
    where: { earningsCallId_secFilingId: { earningsCallId: params.earningsCallId, secFilingId } },
  });
  if (!comparison) {
    return NextResponse.json({ error: 'No comparison has been generated yet.' }, { status: 404 });
  }
  return NextResponse.json(comparison);
}

/** POST /api/v1/earnings/[earningsCallId]/compare-filing?filingId=[secFilingId]&regenerate=true
 * Generates (or regenerates) the cross-source comparison. Reuses Milestone
 * 7's filing processing pipeline (getFilingWithSections) to make sure the
 * filing has sections before comparing. */
export async function POST(request: NextRequest, { params }: { params: { earningsCallId: string } }) {
  const regenerate = request.nextUrl.searchParams.get('regenerate') === 'true';
  const secFilingId = await resolveSecFilingId(params.earningsCallId, request.nextUrl.searchParams.get('filingId'));
  if (!secFilingId) {
    return NextResponse.json({ error: 'No matching SEC filing was found for this call\'s period.' }, { status: 404 });
  }

  try {
    const comparison = await getOrCreateEarningsFilingComparison(params.earningsCallId, secFilingId, { regenerate });
    return NextResponse.json(comparison);
  } catch (error) {
    if (error instanceof EarningsCallNotFoundError || error instanceof FilingNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unexpected error while generating the comparison.' }, { status: 500 });
  }
}
