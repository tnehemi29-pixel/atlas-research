import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { listAssumptions, setAssumption } from '@/lib/services/investmentCaseAssumptionService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_METRICS = ['REVENUE_GROWTH', 'REVENUE_CAGR', 'OPERATING_MARGIN', 'FCF_MARGIN', 'WACC', 'TERMINAL_GROWTH', 'EXIT_MULTIPLE', 'EPS_GROWTH', 'DEBT', 'SHARE_COUNT'];
const VALID_SCENARIOS = ['BULL', 'BASE', 'BEAR'];
const VALID_CONFIDENCE = ['LOW', 'MEDIUM', 'HIGH'];
const VALID_ORIGIN = ['USER', 'AI'];

/** GET /api/investment-cases/[id]/assumptions */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const assumptions = await listAssumptions(user.id, params.id);
    return NextResponse.json(assumptions);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** POST /api/investment-cases/[id]/assumptions — create-or-update on
 * (metric, scenario). { metric, scenario?, value, unit, asOfDate, source, model?, confidence?, origin?, notes? } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const metric = typeof body?.metric === 'string' ? body.metric : '';
  if (!VALID_METRICS.includes(metric)) {
    return NextResponse.json({ error: `metric must be one of: ${VALID_METRICS.join(', ')}` }, { status: 400 });
  }
  const scenario = typeof body?.scenario === 'string' ? body.scenario : undefined;
  if (scenario !== undefined && !VALID_SCENARIOS.includes(scenario)) {
    return NextResponse.json({ error: `scenario must be one of: ${VALID_SCENARIOS.join(', ')}` }, { status: 400 });
  }
  const confidence = typeof body?.confidence === 'string' ? body.confidence : undefined;
  if (confidence !== undefined && !VALID_CONFIDENCE.includes(confidence)) {
    return NextResponse.json({ error: `confidence must be one of: ${VALID_CONFIDENCE.join(', ')}` }, { status: 400 });
  }
  const origin = typeof body?.origin === 'string' ? body.origin : undefined;
  if (origin !== undefined && !VALID_ORIGIN.includes(origin)) {
    return NextResponse.json({ error: `origin must be one of: ${VALID_ORIGIN.join(', ')}` }, { status: 400 });
  }
  const value = typeof body?.value === 'number' ? body.value : NaN;
  const unit = typeof body?.unit === 'string' ? body.unit : '';
  const asOfDate = typeof body?.asOfDate === 'string' ? body.asOfDate : '';
  const source = typeof body?.source === 'string' ? body.source : '';
  if (Number.isNaN(value) || !unit || !asOfDate || !source) {
    return NextResponse.json({ error: 'value, unit, asOfDate, and source are required.' }, { status: 400 });
  }

  try {
    const assumption = await setAssumption(user.id, params.id, {
      metric: metric as never,
      scenario: scenario as never,
      value,
      unit,
      asOfDate,
      source,
      model: typeof body?.model === 'string' ? body.model : null,
      confidence: confidence as never,
      origin: origin as never,
      notes: typeof body?.notes === 'string' ? body.notes : null,
    });
    return NextResponse.json(assumption, { status: 201 });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
