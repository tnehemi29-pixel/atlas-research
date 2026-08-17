import { NextResponse } from 'next/server';
import type { WorkspaceRole } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { changeWorkspaceMemberRole, removeWorkspaceMember } from '@/lib/services/workspaceService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

const VALID_ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN', 'ANALYST', 'VIEWER'];

/** PATCH /api/workspace/[id]/members/[userId] — { role }. OWNER/ADMIN only. */
export async function PATCH(request: Request, { params }: { params: { id: string; userId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.role !== 'string' || !VALID_ROLES.includes(body.role as WorkspaceRole)) {
    return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  try {
    const member = await changeWorkspaceMemberRole(user.id, params.id, params.userId, body.role as WorkspaceRole);
    return NextResponse.json(member);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** DELETE /api/workspace/[id]/members/[userId] — OWNER/ADMIN only. */
export async function DELETE(_request: Request, { params }: { params: { id: string; userId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await removeWorkspaceMember(user.id, params.id, params.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
