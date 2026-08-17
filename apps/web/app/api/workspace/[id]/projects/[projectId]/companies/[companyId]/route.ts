import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { removeResearchProjectCompany } from '@/lib/services/researchProjectService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** DELETE /api/workspace/[id]/projects/[projectId]/companies/[companyId] */
export async function DELETE(_request: Request, { params }: { params: { id: string; projectId: string; companyId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await removeResearchProjectCompany(user.id, params.id, params.projectId, params.companyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
