import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { answerWorkspaceQuestion } from '@/lib/ai/answerWorkspaceQuestion';
import { buildWorkspaceAssistantContext, collectValidWorkspaceContextIds } from '@/lib/workspace/assistantContext';
import { AiNotConfiguredError, AiRequestError } from '@/lib/ai/anthropicClient';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

/** POST /api/workspace/[id]/assistant — { question }. Spec section 22 — the
 * context is built by buildWorkspaceAssistantContext, which already enforces
 * workspace membership and the caller's own data privacy before the AI ever
 * sees anything; every citation it returns is re-verified against that same
 * context's real ids before being sent back. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question) return NextResponse.json({ error: 'question is required.' }, { status: 400 });

  try {
    const context = await buildWorkspaceAssistantContext(user.id, params.id);
    const validIds = collectValidWorkspaceContextIds(context);
    const result = await answerWorkspaceQuestion({ context, question }, validIds);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof AiRequestError) return NextResponse.json({ error: error.message }, { status: 502 });
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
