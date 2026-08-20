import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import {
  CompanyNotFoundError,
  InvalidCostOfDebtOverrideError,
  clearCostOfDebtOverride,
  saveCostOfDebtOverride,
} from '@/lib/services/valuationOverrideService';

export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ costOfDebtOverride: null });
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
