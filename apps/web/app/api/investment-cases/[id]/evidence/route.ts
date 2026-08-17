import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createEvidence, listEvidence, UnsupportedEvidenceSourceError } from '@/lib/services/investmentCaseEvidenceService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

const VALID_DIRECTIONS = ['SUPPORTS', 'CONTRADICTS', 'NEUTRAL'];
const VALID_STRENGTHS = ['LOW', 'MEDIUM', 'HIGH'];
const VALID_SOURCE_TYPES = ['TEN_K', 'TEN_Q', 'EIGHT_K', 'EARNINGS_CALL', 'FINANCIAL_STATEMENT', 'DCF', 'COMPS', 'HISTORICAL_VALIDATION', 'RESEARCH_EVENT'];
const VALID_ORIGIN = ['USER', 'AI'];

/** GET /api/investment-cases/[id]/evidence */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const evidence = await listEvidence(user.id, params.id);
    return NextResponse.json(evidence);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** POST /api/investment-cases/[id]/evidence — every evidence item must
 * resolve to a real, company-scoped Atlas source (see
 * lib/investmentCase/evidenceValidation.ts) — this is the ONE write path,
 * used identically whether a human or the AI assistant proposes it. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const direction = typeof body?.direction === 'string' ? body.direction : '';
  if (!VALID_DIRECTIONS.includes(direction)) {
    return NextResponse.json({ error: `direction must be one of: ${VALID_DIRECTIONS.join(', ')}` }, { status: 400 });
  }
  const strength = typeof body?.strength === 'string' ? body.strength : '';
  if (!VALID_STRENGTHS.includes(strength)) {
    return NextResponse.json({ error: `strength must be one of: ${VALID_STRENGTHS.join(', ')}` }, { status: 400 });
  }
  const sourceType = typeof body?.sourceType === 'string' ? body.sourceType : '';
  if (!VALID_SOURCE_TYPES.includes(sourceType)) {
    return NextResponse.json({ error: `sourceType must be one of: ${VALID_SOURCE_TYPES.join(', ')}` }, { status: 400 });
  }
  const origin = typeof body?.origin === 'string' ? body.origin : undefined;
  if (origin !== undefined && !VALID_ORIGIN.includes(origin)) {
    return NextResponse.json({ error: `origin must be one of: ${VALID_ORIGIN.join(', ')}` }, { status: 400 });
  }
  const claim = typeof body?.claim === 'string' ? body.claim : '';
  const evidenceText = typeof body?.evidence === 'string' ? body.evidence : '';
  const date = typeof body?.date === 'string' ? body.date : '';
  const category = typeof body?.category === 'string' ? body.category : '';
  const sourceLabel = typeof body?.sourceLabel === 'string' ? body.sourceLabel : '';
  if (!claim || !evidenceText || !date || !category || !sourceLabel) {
    return NextResponse.json({ error: 'claim, evidence, date, category, and sourceLabel are required.' }, { status: 400 });
  }

  try {
    const evidence = await createEvidence(user.id, params.id, {
      claim,
      evidence: evidenceText,
      date,
      category,
      direction: direction as never,
      strength: strength as never,
      sourceType: sourceType as never,
      sourceLabel,
      secFilingId: typeof body?.secFilingId === 'string' ? body.secFilingId : null,
      earningsCallId: typeof body?.earningsCallId === 'string' ? body.earningsCallId : null,
      researchEventId: typeof body?.researchEventId === 'string' ? body.researchEventId : null,
      origin: origin as never,
    });
    return NextResponse.json(evidence, { status: 201 });
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof UnsupportedEvidenceSourceError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
