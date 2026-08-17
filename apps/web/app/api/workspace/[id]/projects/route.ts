import { NextResponse } from 'next/server';
import type { ResearchProjectStatus } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createResearchProject, listResearchProjects } from '@/lib/services/researchProjectService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ResearchProjectStatus[] = ['PLANNED', 'ACTIVE', 'UNDER_REVIEW', 'COMPLETED', 'ARCHIVED'];

/** GET /api/workspace/[id]/projects?status= */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const status = new URL(request.url).searchParams.get('status');
  if (status && !VALID_STATUSES.includes(status as ResearchProjectStatus)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const projects = await listResearchProjects(user.id, params.id, { status: status as ResearchProjectStatus | undefined });
    return NextResponse.json(projects);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** POST /api/workspace/[id]/projects — { name, description?, status?, ownerUserId? } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';
  const description = typeof body?.description === 'string' ? body.description : undefined;
  const status = typeof body?.status === 'string' && VALID_STATUSES.includes(body.status as ResearchProjectStatus) ? (body.status as ResearchProjectStatus) : undefined;
  const ownerUserId = typeof body?.ownerUserId === 'string' ? body.ownerUserId : undefined;

  try {
    const project = await createResearchProject(user.id, params.id, { name, description, status, ownerUserId });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
