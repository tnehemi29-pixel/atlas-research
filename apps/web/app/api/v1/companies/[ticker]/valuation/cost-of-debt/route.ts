import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import {
  CompanyNotFoundError,
  InvalidCostOfDebtOverrideError,
  clearCostOfDebtOverride,
  saveCostOfDebtOverride,
} from '@/lib/services/valuationOverrideService';
import { computeIntegritySnapshot } from '@/lib/services/integritySnapshotService';

export const dynamic = 'force-dynamic';

/**
 * Saving/clearing a cost-of-debt override can flip the DCF model's own
 * validity (this is exactly what a saved override is for), but
 * IntegritySnapshot is otherwise only recomputed on a 15-minute TTL or an
 * explicit "Refresh" click (see getCompanyIntegritySnapshot) — without this,
 * a company can show a valid, unblocked WACC on the Valuation page while
 * Research Integrity keeps reporting the old, now-stale DCF finding for up
 * to that TTL window. Best-effort and non-blocking to the caller: a
 * transient failure here must never turn a successful override save into an
 * error response — the override itself is the operation that matters; this
 * is just keeping the cached snapshot from lagging behind it.
 */
async function refreshIntegritySnapshot(ticker: string): Promise<void> {
  try {
    const company = await db.company.findUnique({ where: { ticker: ticker.trim().toUpperCase() }, select: { id: true } });
    if (company) await computeIntegritySnapshot(company.id);
  } catch {
    // Best-effort — the override save/clear above already succeeded and is
    // the source of truth; the next TTL expiry or manual Refresh will catch
    // up. Never surfaced as a failure of the save/clear itself.
  }
}

/** PUT /api/v1/companies/[ticker]/valuation/cost-of-debt — { costOfDebtOverride }
 * Saves an explicit, user-entered pre-tax cost-of-debt assumption for this
 * company. Only ever writes the exact number supplied — never a default. */
export async function PUT(request: Request, { params }: { params: { ticker: string } }) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);

  try {
    const costOfDebtOverride = await saveCostOfDebtOverride(params.ticker, body?.costOfDebtOverride);
    await refreshIntegritySnapshot(params.ticker);
    return NextResponse.json({ costOfDebtOverride });
  } catch (error) {
    if (error instanceof InvalidCostOfDebtOverrideError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof CompanyNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** DELETE /api/v1/companies/[ticker]/valuation/cost-of-debt
 * Clears a previously saved override, restoring the historical/blocked
 * default behavior. */
export async function DELETE(_request: Request, { params }: { params: { ticker: string } }) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await clearCostOfDebtOverride(params.ticker);
    await refreshIntegritySnapshot(params.ticker);
    return NextResponse.json({ costOfDebtOverride: null });
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
