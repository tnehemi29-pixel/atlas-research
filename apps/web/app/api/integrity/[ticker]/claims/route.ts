import { NextResponse } from 'next/server';
import type { ClaimValidationStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { listClaims } from '@/lib/services/researchClaimService';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ClaimValidationStatus[] = ['VERIFIED', 'UNVERIFIED', 'CONTRADICTED', 'STALE', 'REJECTED'];

/** GET /api/integrity/[ticker]/claims?validationStatus= — the research
 * claim registry for this company (spec section 14). No auth required —
 * company-scoped research data, same convention as thesis-monitor/timeline. */
export async function GET(request: Request, { params }: { params: { ticker: string } }) {
  const company = await db.company.findUnique({ where: { ticker: params.ticker.trim().toUpperCase() } });
  if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });

  const validationStatus = new URL(request.url).searchParams.get('validationStatus');
  if (validationStatus && !VALID_STATUSES.includes(validationStatus as ClaimValidationStatus)) {
    return NextResponse.json({ error: `validationStatus must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  const claims = await listClaims(company.id, { validationStatus: validationStatus as ClaimValidationStatus | undefined });
  return NextResponse.json(claims);
}
