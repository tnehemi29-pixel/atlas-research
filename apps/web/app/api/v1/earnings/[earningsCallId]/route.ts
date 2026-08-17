import { NextResponse } from 'next/server';
import {
  EarningsCallNotFoundError,
  getCallWithSegments,
  getEarningsFinancialResults,
} from '@/lib/services/earningsCallService';

export const dynamic = 'force-dynamic';

/** GET /api/v1/earnings/[earningsCallId]
 * Call detail + transcript segments + deterministic financial results.
 * Triggers the transcript fetch/parse pipeline if this call hasn't been
 * processed yet (PENDING) — the response's `call.processingStatus` tells
 * the UI whether that succeeded (COMPLETE), found no transcript
 * (UNAVAILABLE), or failed (FAILED + processingError). Financial results
 * come from Atlas's own SEC-sourced data, never the transcript. */
export async function GET(_request: Request, { params }: { params: { earningsCallId: string } }) {
  try {
    const { call, segments } = await getCallWithSegments(params.earningsCallId);
    const financialResults = await getEarningsFinancialResults(call);
    return NextResponse.json({ call, segments, financialResults });
  } catch (error) {
    if (error instanceof EarningsCallNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unexpected error while loading the earnings call.' }, { status: 500 });
  }
}
