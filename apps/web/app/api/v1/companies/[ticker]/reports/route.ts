import { NextResponse } from 'next/server';
import { ResearchCompanyNotFoundError } from '@/lib/research/aggregateResearchContext';
import { createReport, listReports } from '@/lib/services/researchReportService';
import { SecRateLimitError, SecRequestError } from '@/lib/providers/secEdgar';
import { AI_RATE_LIMIT, checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/** The heaviest single operation in the app: aggregates SEC/FMP data, runs
 * the DCF engine three times (base/bear/bull) and the comps engine, then
 * makes one large-context Anthropic completion call — comfortably capable
 * of exceeding a default serverless timeout on an uncached first run. 60s
 * gives real headroom without claiming an unbounded amount of platform
 * execution time. */
export const maxDuration = 60;

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
 * source unavailable) is a non-200 response.
 * Rate-limited by IP — this route is intentionally public (company research
 * data, not user-owned), so IP is the only identity available to bound the
 * real Anthropic spend a single caller can trigger. */
export async function POST(request: Request, { params }: { params: { ticker: string } }) {
  const { allowed, retryAfterSeconds } = checkRateLimit('ai', getClientIp(request), AI_RATE_LIMIT);
  if (!allowed) return rateLimitResponse(retryAfterSeconds, 'Too many report generations from this client. Please try again shortly.');

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
