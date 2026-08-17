import { NextResponse } from 'next/server';
import type { CommentParentType } from '@prisma/client';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createResearchComment, listResearchComments } from '@/lib/services/researchCommentService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

const VALID_PARENT_TYPES: CommentParentType[] = ['RESEARCH_REPORT', 'INVESTMENT_CASE', 'RESEARCH_NOTE', 'RESEARCH_TASK'];

/** GET /api/workspace/[id]/comments?parentType=&parentId= */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const url = new URL(request.url);
  const parentType = url.searchParams.get('parentType');
  const parentId = url.searchParams.get('parentId');
  if (!parentType || !VALID_PARENT_TYPES.includes(parentType as CommentParentType)) return NextResponse.json({ error: `parentType must be one of: ${VALID_PARENT_TYPES.join(', ')}` }, { status: 400 });
  if (!parentId) return NextResponse.json({ error: 'parentId is required.' }, { status: 400 });

  try {
    const comments = await listResearchComments(user.id, params.id, parentType as CommentParentType, parentId);
    return NextResponse.json(comments);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** POST /api/workspace/[id]/comments — { parentType, parentId, content }. Every workspace member, including VIEWER. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.parentType !== 'string' || !VALID_PARENT_TYPES.includes(body.parentType as CommentParentType)) {
    return NextResponse.json({ error: `parentType must be one of: ${VALID_PARENT_TYPES.join(', ')}` }, { status: 400 });
  }
  const parentId = typeof body?.parentId === 'string' ? body.parentId : '';
  const content = typeof body?.content === 'string' ? body.content : '';

  try {
    const comment = await createResearchComment(user.id, params.id, { parentType: body.parentType as CommentParentType, parentId, content });
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
