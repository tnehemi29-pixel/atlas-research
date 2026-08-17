import { NextResponse } from 'next/server';
import { getCitationCoverage } from '@/lib/services/citationCoverageService';

export const dynamic = 'force-dynamic';

/** GET /api/v1/reports/[reportId]/citation-coverage — spec section 18.
 * No auth required, matching every other read on a global ResearchReport. */
export async function GET(_request: Request, { params }: { params: { reportId: string } }) {
  const coverage = await getCitationCoverage(params.reportId);
  return NextResponse.json(coverage);
}
