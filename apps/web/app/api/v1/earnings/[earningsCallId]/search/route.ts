import { NextRequest, NextResponse } from 'next/server';
import { searchCall } from '@/lib/services/earningsCallService';

export const dynamic = 'force-dynamic';

/** GET /api/v1/earnings/[earningsCallId]/search?q=... */
export async function GET(request: NextRequest, { params }: { params: { earningsCallId: string } }) {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  const results = await searchCall(params.earningsCallId, query);
  return NextResponse.json(results);
}
