import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { InvalidIntegrityIssueInputError, IntegrityIssueNotFoundError, ignoreIntegrityIssue } from '@/lib/services/integrityIssueService';

export const dynamic = 'force-dynamic';

/** POST /api/integrity/issues/[id]/ignore — { reason } (required — spec
 * section 21's explicit requirement). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason : '';

  try {
    const issue = await ignoreIntegrityIssue(params.id, user.id, reason);
    return NextResponse.json(issue);
  } catch (error) {
    if (error instanceof IntegrityIssueNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof InvalidIntegrityIssueInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
