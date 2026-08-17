import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { compareVersions, InvestmentCaseVersionNotFoundError } from '@/lib/services/investmentCaseVersionService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';

export const dynamic = 'force-dynamic';

/** GET /api/investment-cases/[id]/versions/compare?from=1&to=2 — a
 * deterministic structural diff between two frozen snapshots, never
 * AI-generated. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const url = new URL(request.url);
  const from = Number(url.searchParams.get('from'));
  const to = Number(url.searchParams.get('to'));
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) {
    return NextResponse.json({ error: 'from and to must be positive integer version numbers.' }, { status: 400 });
  }

  try {
    const diff = await compareVersions(user.id, params.id, from, to);
    return NextResponse.json(diff);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentCaseVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
