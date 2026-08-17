import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { askInvestmentThesisAssistant } from '@/lib/ai/investmentThesisAssistant';
import { buildInvestmentCaseContext, collectValidCitationIds } from '@/lib/investmentCase/context';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';
import { AiNotConfiguredError, AiRequestError } from '@/lib/ai/anthropicClient';

export const dynamic = 'force-dynamic';

/** POST /api/investment-cases/[id]/assistant — { question }. The assistant
 * only synthesizes/compares/explains/identifies-conflicts/surfaces-questions
 * over this case's own real data (see lib/ai/investmentThesisPrompts.ts's
 * system prompt) — it never predicts, guarantees, invents, decides, alters
 * a model, or gives personalized advice. Every citation it returns is
 * re-verified against the case's real evidence/research-event ids before
 * being sent back. */
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
    const context = await buildInvestmentCaseContext(user.id, params.id);
    const validIds = collectValidCitationIds(context);
    const result = await askInvestmentThesisAssistant({ context, question }, validIds);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof AiNotConfiguredError) return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof AiRequestError) return NextResponse.json({ error: error.message }, { status: 502 });
    throw error;
  }
}
