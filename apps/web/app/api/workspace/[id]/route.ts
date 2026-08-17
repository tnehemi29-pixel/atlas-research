import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getWorkspaceDetail, WorkspaceNotFoundError } from '@/lib/services/workspaceService';

export const dynamic = 'force-dynamic';

/** GET /api/workspace/[id] */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const workspace = await getWorkspaceDetail(user.id, params.id);
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
