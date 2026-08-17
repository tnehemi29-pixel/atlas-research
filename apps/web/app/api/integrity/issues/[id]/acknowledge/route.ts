import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { acknowledgeIntegrityIssue, IntegrityIssueNotFoundError } from '@/lib/services/integrityIssueService';

export const dynamic = 'force-dynamic';

/** POST /api/integrity/issues/[id]/acknowledge */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const issue = await acknowledgeIntegrityIssue(params.id, user.id);
    return NextResponse.json(issue);
  } catch (error) {
    if (error instanceof IntegrityIssueNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
