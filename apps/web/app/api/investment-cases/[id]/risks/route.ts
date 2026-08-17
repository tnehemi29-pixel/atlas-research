import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createRisk, listRisks } from '@/lib/services/investmentCaseRiskService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];
const VALID_STATUSES = ['MONITORING', 'ESCALATING', 'MITIGATED', 'REALIZED'];

/** GET /api/investment-cases/[id]/risks */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const risks = await listRisks(user.id, params.id);
    return NextResponse.json(risks);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** POST /api/investment-cases/[id]/risks — { risk, probability?, impact, evidence?, status?, mitigation? } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const impact = typeof body?.impact === 'string' ? body.impact : '';
  if (!VALID_LEVELS.includes(impact)) {
    return NextResponse.json({ error: `impact must be one of: ${VALID_LEVELS.join(', ')}` }, { status: 400 });
  }
  const probability = typeof body?.probability === 'string' ? body.probability : undefined;
  if (probability !== undefined && !VALID_LEVELS.includes(probability)) {
    return NextResponse.json({ error: `probability must be one of: ${VALID_LEVELS.join(', ')}` }, { status: 400 });
  }
  const status = typeof body?.status === 'string' ? body.status : undefined;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }
  const risk = typeof body?.risk === 'string' ? body.risk : '';
  if (!risk) return NextResponse.json({ error: 'risk is required.' }, { status: 400 });

  try {
    const created = await createRisk(user.id, params.id, {
      risk,
      probability: probability as never,
      impact: impact as never,
      evidence: typeof body?.evidence === 'string' ? body.evidence : null,
      status: status as never,
      mitigation: typeof body?.mitigation === 'string' ? body.mitigation : null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
