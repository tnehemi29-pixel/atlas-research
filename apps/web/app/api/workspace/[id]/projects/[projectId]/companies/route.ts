import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { addResearchProjectCompany } from '@/lib/services/researchProjectService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** POST /api/workspace/[id]/projects/[projectId]/companies — { ticker } */
export async function POST(request: Request, { params }: { params: { id: string; projectId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const ticker = typeof body?.ticker === 'string' ? body.ticker : '';

  try {
    await addResearchProjectCompany(user.id, params.id, params.projectId, ticker);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
