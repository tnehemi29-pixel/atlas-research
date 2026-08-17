import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { deleteInvalidationCriterion, InvestmentCaseInvalidationCriterionNotFoundError, updateInvalidationCriterion } from '@/lib/services/investmentCaseInvalidationCriterionService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_METRICS = ['REVENUE_GROWTH', 'REVENUE_CAGR', 'OPERATING_MARGIN', 'FCF_MARGIN', 'WACC', 'TERMINAL_GROWTH', 'EXIT_MULTIPLE', 'EPS_GROWTH', 'DEBT', 'SHARE_COUNT'];
const VALID_COMPARATORS = ['LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL'];
const VALID_STATUSES = ['ACTIVE', 'POTENTIALLY_MET', 'RESOLVED'];

/** PATCH /api/investment-cases/[id]/invalidation-criteria/[criterionId] —
 * `status` transitions to RESOLVED are always an explicit user action here,
 * never written by the advisory live-evaluation read path. */
export async function PATCH(request: Request, { params }: { params: { id: string; criterionId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (body?.metric !== undefined && body.metric !== null && !VALID_METRICS.includes(body.metric)) {
    return NextResponse.json({ error: `metric must be one of: ${VALID_METRICS.join(', ')}` }, { status: 400 });
  }
  if (body?.comparator !== undefined && body.comparator !== null && !VALID_COMPARATORS.includes(body.comparator)) {
    return NextResponse.json({ error: `comparator must be one of: ${VALID_COMPARATORS.join(', ')}` }, { status: 400 });
  }
  if (body?.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const updated = await updateInvalidationCriterion(user.id, params.id, params.criterionId, {
      description: typeof body?.description === 'string' ? body.description : undefined,
      metric: body?.metric,
      comparator: body?.comparator,
      thresholdValue: body?.thresholdValue === null || typeof body?.thresholdValue === 'number' ? body.thresholdValue : undefined,
      thresholdUnit: body?.thresholdUnit === null || typeof body?.thresholdUnit === 'string' ? body.thresholdUnit : undefined,
      consecutivePeriods: body?.consecutivePeriods === null || typeof body?.consecutivePeriods === 'number' ? body.consecutivePeriods : undefined,
      status: body?.status,
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseInvalidationCriterionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

/** DELETE /api/investment-cases/[id]/invalidation-criteria/[criterionId] */
export async function DELETE(_request: Request, { params }: { params: { id: string; criterionId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await deleteInvalidationCriterion(user.id, params.id, params.criterionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseInvalidationCriterionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
