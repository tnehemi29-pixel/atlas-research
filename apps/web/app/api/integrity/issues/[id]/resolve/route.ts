import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { InvalidIntegrityIssueInputError, IntegrityIssueNotFoundError, resolveIntegrityIssue } from '@/lib/services/integrityIssueService';

export const dynamic = 'force-dynamic';

/** POST /api/integrity/issues/[id]/resolve — { resolution } (required).
 * Financial discrepancies, model errors, contradictions, and thesis
 * conflicts are never auto-resolved (spec section 22) — this is always an
 * explicit human action with a recorded explanation. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const resolution = typeof body?.resolution === 'string' ? body.resolution : '';

  try {
    const issue = await resolveIntegrityIssue(params.id, user.id, resolution);
    return NextResponse.json(issue);
  } catch (error) {
    if (error instanceof IntegrityIssueNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof InvalidIntegrityIssueInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
