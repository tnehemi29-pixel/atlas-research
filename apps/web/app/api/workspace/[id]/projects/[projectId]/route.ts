import { NextResponse } from 'next/server';
import type { ResearchProjectStatus } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getResearchProjectDetail, updateResearchProject } from '@/lib/services/researchProjectService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ResearchProjectStatus[] = ['PLANNED', 'ACTIVE', 'UNDER_REVIEW', 'COMPLETED', 'ARCHIVED'];

/** GET /api/workspace/[id]/projects/[projectId] */
export async function GET(_request: Request, { params }: { params: { id: string; projectId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const project = await getResearchProjectDetail(user.id, params.id, params.projectId);
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** PATCH /api/workspace/[id]/projects/[projectId] — { name?, description?, status?, ownerUserId? } */
export async function PATCH(request: Request, { params }: { params: { id: string; projectId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (body?.status !== undefined && !VALID_STATUSES.includes(body.status as ResearchProjectStatus)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const project = await updateResearchProject(user.id, params.id, params.projectId, {
      name: typeof body?.name === 'string' ? body.name : undefined,
      description: body?.description === null ? null : typeof body?.description === 'string' ? body.description : undefined,
      status: body?.status,
      ownerUserId: typeof body?.ownerUserId === 'string' ? body.ownerUserId : undefined,
    });
    return NextResponse.json(project);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
