import { NextResponse } from 'next/server';
import { getThesisMonitor } from '@/lib/services/thesisMonitorService';

export const dynamic = 'force-dynamic';

/** GET /api/companies/[ticker]/thesis-monitor — the company's latest
 * research report's structurally-extracted assumptions, each compared
 * against the best currently-available live observation. 404 only when the
 * company has no successful research report to monitor. */
export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  const result = await getThesisMonitor(params.ticker);
  if (!result) return NextResponse.json({ error: 'No research report found for this company.' }, { status: 404 });
  return NextResponse.json(result);
}
