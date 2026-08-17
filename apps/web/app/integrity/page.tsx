import type { Metadata } from 'next';
import { getGlobalIntegrityDashboard } from '@/lib/services/integritySnapshotService';
import { IntegrityDashboardWorkspace } from '@/components/integrity/IntegrityDashboardWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Integrity · Atlas Research' };

/** Spec section 20 — the global integrity dashboard. No auth required (see
 * app/api/integrity/route.ts) since this is company-scoped research data,
 * not user-owned data; the link only appears in the nav once logged in
 * (matching /filings, /earnings-calendar, /reports), but the page itself
 * works either way. */
export default async function IntegrityDashboardPage() {
  const rows = await getGlobalIntegrityDashboard();
  const serialized = rows.map((row) => ({ ...row, computedAt: row.computedAt.toISOString() }));
  return <IntegrityDashboardWorkspace initialRows={serialized} />;
}
