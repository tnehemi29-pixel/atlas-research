import { NextRequest, NextResponse } from 'next/server';
import { searchFiling } from '@/lib/services/secFilingService';

export const dynamic = 'force-dynamic';

/** GET /api/v1/filings/[filingId]/search?q=... */
export async function GET(request: NextRequest, { params }: { params: { filingId: string } }) {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  const results = await searchFiling(params.filingId, query);
  return NextResponse.json(results);
}
