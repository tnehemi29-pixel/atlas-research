import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getResearchNoteDetail, updateResearchNote } from '@/lib/services/researchNoteService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** GET /api/workspace/[id]/notes/[noteId] */
export async function GET(_request: Request, { params }: { params: { id: string; noteId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const note = await getResearchNoteDetail(user.id, params.id, params.noteId);
    return NextResponse.json(note);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** PATCH /api/workspace/[id]/notes/[noteId] — { title?, content?, tags? }. Author or OWNER/ADMIN only. */
export async function PATCH(request: Request, { params }: { params: { id: string; noteId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t: unknown): t is string => typeof t === 'string') : undefined;

  try {
    const note = await updateResearchNote(user.id, params.id, params.noteId, {
      title: typeof body?.title === 'string' ? body.title : undefined,
      content: typeof body?.content === 'string' ? body.content : undefined,
      tags,
    });
    return NextResponse.json(note);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
