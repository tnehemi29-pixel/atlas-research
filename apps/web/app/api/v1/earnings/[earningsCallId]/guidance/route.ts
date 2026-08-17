import { NextResponse } from 'next/server';
import { getGuidanceObservations } from '@/lib/services/earningsCallService';

export const dynamic = 'force-dynamic';

/** GET /api/v1/earnings/[earningsCallId]/guidance
 * The call's resolved guidance observations — low/high as stated, plus the
 * deterministically computed midpoint and change vs. the prior call's
 * guidance for the same metric+period. Read-only: guidance is produced as a
 * side effect of generating the main analysis (POST .../analysis), not
 * generated independently here. */
export async function GET(_request: Request, { params }: { params: { earningsCallId: string } }) {
  const observations = await getGuidanceObservations(params.earningsCallId);
  return NextResponse.json(observations);
}
