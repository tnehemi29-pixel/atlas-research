import { NextResponse } from 'next/server';
import { getReport, ResearchReportNotFoundError } from '@/lib/services/researchReportService';

export const dynamic = 'force-dynamic';

/** GET /api/v1/reports/[reportId]
 * A single, specific report version — read-only, never generates. */
export async function GET(_request: Request, { params }: { params: { reportId: string } }) {
  try {
    const report = await getReport(params.reportId);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof ResearchReportNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
