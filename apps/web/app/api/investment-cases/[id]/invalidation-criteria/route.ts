import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createInvalidationCriterion, listInvalidationCriteria } from '@/lib/services/investmentCaseInvalidationCriterionService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_METRICS = ['REVENUE_GROWTH', 'REVENUE_CAGR', 'OPERATING_MARGIN', 'FCF_MARGIN', 'WACC', 'TERMINAL_GROWTH', 'EXIT_MULTIPLE', 'EPS_GROWTH', 'DEBT', 'SHARE_COUNT'];
const VALID_COMPARATORS = ['LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL'];

/** GET /api/investment-cases/[id]/invalidation-criteria */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const criteria = await listInvalidationCriteria(user.id, params.id);
    return NextResponse.json(criteria);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** POST /api/investment-cases/[id]/invalidation-criteria — { description,
 * metric?, comparator?, thresholdValue?, thresholdUnit?, consecutivePeriods? }
 * — metric/comparator/thresholdValue may all be omitted for a purely
 * qualitative (non-machine-checkable) criterion. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const description = typeof body?.description === 'string' ? body.description : '';
  if (!description) return NextResponse.json({ error: 'description is required.' }, { status: 400 });

  const metric = typeof body?.metric === 'string' ? body.metric : undefined;
  if (metric !== undefined && !VALID_METRICS.includes(metric)) {
    return NextResponse.json({ error: `metric must be one of: ${VALID_METRICS.join(', ')}` }, { status: 400 });
  }
  const comparator = typeof body?.comparator === 'string' ? body.comparator : undefined;
  if (comparator !== undefined && !VALID_COMPARATORS.includes(comparator)) {
    return NextResponse.json({ error: `comparator must be one of: ${VALID_COMPARATORS.join(', ')}` }, { status: 400 });
  }

  try {
    const created = await createInvalidationCriterion(user.id, params.id, {
      description,
      metric: (metric as never) ?? null,
      comparator: (comparator as never) ?? null,
      thresholdValue: typeof body?.thresholdValue === 'number' ? body.thresholdValue : null,
      thresholdUnit: typeof body?.thresholdUnit === 'string' ? body.thresholdUnit : null,
      consecutivePeriods: typeof body?.consecutivePeriods === 'number' ? body.consecutivePeriods : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
