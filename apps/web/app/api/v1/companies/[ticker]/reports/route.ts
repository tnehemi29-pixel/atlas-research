import { NextResponse } from 'next/server';
import { ResearchCompanyNotFoundError } from '@/lib/research/aggregateResearchContext';
import { createReport, listReports } from '@/lib/services/researchReportService';
import { SecRateLimitError, SecRequestError } from '@/lib/providers/secEdgar';

export const dynamic = 'force-dynamic';

/** GET /api/v1/companies/[ticker]/reports
 * Every stored report version for this company, most recent first — never
 * generates. A page load is always free. */
export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  const reports = await listReports(params.ticker);
  return NextResponse.json(reports);
}

/** POST /api/v1/companies/[ticker]/reports
 * Aggregates the current research context and generates a new report
 * version — never overwrites a prior one. Always returns 200 with the
 * stored report row: a failed AI generation is itself a successfully
 * *recorded* outcome (status: 'FAILED', with `error` explaining why), not
 * an HTTP failure — the client checks `status` to render accordingly. Only
 * a genuinely exceptional condition (no such company, an upstream data
 * source unavailable) is a non-200 response. */
export async function POST(_request: Request, { params }: { params: { ticker: string } }) {
  try {
    const report = await createReport(params.ticker);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof ResearchCompanyNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SecRateLimitError) {
      return NextResponse.json({ error: 'SEC EDGAR rate limit reached — try again shortly.' }, { status: 429 });
    }
    if (error instanceof SecRequestError) {
      return NextResponse.json({ error: 'SEC EDGAR is unavailable right now.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error while generating the research report.' }, { status: 500 });
  }
}
