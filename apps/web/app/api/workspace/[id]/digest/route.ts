import { NextResponse } from 'next/server';
import type { DigestPeriod } from '@/lib/services/researchDigestService';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getResearchDigest } from '@/lib/services/researchDigestService';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';
import { AI_RATE_LIMIT, checkRateLimit, rateLimitResponse } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/** Unlike most GET routes in this app, this one runs a real (uncached)
 * Anthropic narrative call on every request — see researchDigestService.ts. */
export const maxDuration = 30;

const VALID_PERIODS: DigestPeriod[] = ['DAILY', 'WEEKLY'];

/** GET /api/workspace/[id]/digest?period=DAILY|WEEKLY
 * Rate-limited by user id — this route requires auth, and (unusually for a
 * GET) triggers a real AI narrative call on every request. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const { allowed, retryAfterSeconds } = checkRateLimit('ai', user.id, AI_RATE_LIMIT);
  if (!allowed) return rateLimitResponse(retryAfterSeconds, 'Too many digest requests. Please try again shortly.');

  const period = new URL(request.url).searchParams.get('period') ?? 'WEEKLY';
  if (!VALID_PERIODS.includes(period as DigestPeriod)) return NextResponse.json({ error: `period must be one of: ${VALID_PERIODS.join(', ')}` }, { status: 400 });

  try {
    const digest = await getResearchDigest(user.id, params.id, period as DigestPeriod);
    return NextResponse.json(digest);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
