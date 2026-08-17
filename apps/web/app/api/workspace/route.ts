import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createWorkspace, InvalidWorkspaceInputError, listUserWorkspaces } from '@/lib/services/workspaceService';

export const dynamic = 'force-dynamic';

/** GET /api/workspace — every workspace the caller is a member of. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const workspaces = await listUserWorkspaces(user.id);
  return NextResponse.json(workspaces);
}

/** POST /api/workspace — { name, slug? }. The creator becomes the first OWNER. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';
  const slug = typeof body?.slug === 'string' ? body.slug : undefined;

  try {
    const workspace = await createWorkspace(user.id, { name, slug });
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidWorkspaceInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
