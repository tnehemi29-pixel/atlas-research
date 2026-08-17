import { NextResponse } from 'next/server';
import type { WorkspaceRole } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { addWorkspaceMember, listWorkspaceMembers } from '@/lib/services/workspaceService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

const VALID_ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN', 'ANALYST', 'VIEWER'];

/** GET /api/workspace/[id]/members */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const members = await listWorkspaceMembers(user.id, params.id);
    return NextResponse.json(members);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** POST /api/workspace/[id]/members — { email, role? }. OWNER/ADMIN only. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : '';
  const role = typeof body?.role === 'string' && VALID_ROLES.includes(body.role as WorkspaceRole) ? (body.role as WorkspaceRole) : undefined;

  try {
    const member = await addWorkspaceMember(user.id, params.id, { email, role });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
