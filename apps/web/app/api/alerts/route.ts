import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createAlert, evaluateAlerts, InvalidAlertInputError } from '@/lib/services/alertService';
import { ensureCompanyByTicker } from '@/lib/services/companyService';

export const dynamic = 'force-dynamic';

const VALID_TYPES = [
  'NEW_SEC_FILING',
  'EARNINGS_AVAILABLE',
  'DCF_VALUATION_CHANGE',
  'RESEARCH_REPORT_UPDATED',
  'GUIDANCE_CHANGED',
  'HIGH_IMPORTANCE_RESEARCH_EVENT',
  'CRITICAL_RESEARCH_EVENT',
  'NEW_MATERIAL_RISK',
];

/** GET /api/alerts — every alert belonging to the current user, freshly
 * re-evaluated against current data (deterministic, on-demand — no
 * background job queue exists in this codebase). */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const alerts = await evaluateAlerts(user.id);
  return NextResponse.json(alerts);
}

/** POST /api/alerts — { type, companyId?, thresholdPercent? } */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const type = typeof body?.type === 'string' ? body.type : '';
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }

  const ticker = typeof body?.ticker === 'string' ? body.ticker.trim() : '';
  const companyId = ticker ? (await ensureCompanyByTicker(ticker)).id : null;

  try {
    const alert = await createAlert(user.id, {
      type: type as never,
      companyId,
      thresholdPercent: typeof body?.thresholdPercent === 'number' ? body.thresholdPercent : null,
    });
    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidAlertInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
