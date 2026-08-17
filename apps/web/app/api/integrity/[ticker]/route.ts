import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCompanyIntegritySnapshot } from '@/lib/services/integritySnapshotService';

export const dynamic = 'force-dynamic';

/** GET /api/integrity/[ticker]?refresh=true — a company's current research
 * integrity snapshot, served from cache unless `refresh=true` forces a
 * fresh computation (spec section 19's company integrity panel). 404s for a
 * ticker Atlas has never seen — never silently creates one, unlike some
 * other company-scoped write paths in this codebase. No auth required —
 * company-scoped research data, same convention as thesis-monitor/timeline. */
export async function GET(request: Request, { params }: { params: { ticker: string } }) {
  const company = await db.company.findUnique({ where: { ticker: params.ticker.trim().toUpperCase() } });
  if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });

  const forceRefresh = new URL(request.url).searchParams.get('refresh') === 'true';
  const snapshot = await getCompanyIntegritySnapshot(company.id, { forceRefresh });
  return NextResponse.json({ ...snapshot, ticker: company.ticker, companyName: company.name });
}
