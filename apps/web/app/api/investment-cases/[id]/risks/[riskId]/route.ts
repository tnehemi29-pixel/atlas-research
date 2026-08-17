import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { deleteRisk, InvestmentCaseRiskNotFoundError, updateRisk } from '@/lib/services/investmentCaseRiskService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];
const VALID_STATUSES = ['MONITORING', 'ESCALATING', 'MITIGATED', 'REALIZED'];

/** PATCH /api/investment-cases/[id]/risks/[riskId] */
export async function PATCH(request: Request, { params }: { params: { id: string; riskId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (body?.impact !== undefined && !VALID_LEVELS.includes(body.impact)) {
    return NextResponse.json({ error: `impact must be one of: ${VALID_LEVELS.join(', ')}` }, { status: 400 });
  }
  if (body?.probability !== undefined && body.probability !== null && !VALID_LEVELS.includes(body.probability)) {
    return NextResponse.json({ error: `probability must be one of: ${VALID_LEVELS.join(', ')}` }, { status: 400 });
  }
  if (body?.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const updated = await updateRisk(user.id, params.id, params.riskId, {
      risk: typeof body?.risk === 'string' ? body.risk : undefined,
      probability: body?.probability,
      impact: body?.impact,
      evidence: body?.evidence === null || typeof body?.evidence === 'string' ? body.evidence : undefined,
      status: body?.status,
      mitigation: body?.mitigation === null || typeof body?.mitigation === 'string' ? body.mitigation : undefined,
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseRiskNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

/** DELETE /api/investment-cases/[id]/risks/[riskId] */
export async function DELETE(_request: Request, { params }: { params: { id: string; riskId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await deleteRisk(user.id, params.id, params.riskId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseRiskNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
