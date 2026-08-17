import { NextResponse } from 'next/server';
import { getGlobalIntegrityDashboard } from '@/lib/services/integritySnapshotService';

export const dynamic = 'force-dynamic';

/** GET /api/integrity — every company with an already-computed integrity
 * snapshot, newest/most-severe first. Never triggers a fresh computation for
 * every company in Atlas (spec section 29) — visit a company's own
 * /company/[ticker] page (or GET /api/integrity/[ticker]) to compute or
 * refresh its snapshot.
 *
 * No auth required — like /api/companies/[ticker]/thesis-monitor and
 * /api/companies/[ticker]/timeline, this is company-scoped research data,
 * not user-owned data, so it follows this codebase's existing convention of
 * leaving company-scoped reads public while gating user-specific reads and
 * every write. */
export async function GET() {
  const rows = await getGlobalIntegrityDashboard();
  return NextResponse.json(rows);
}
