import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getEarningsCalendar } from '@/lib/services/earningsCalendarService';

export const dynamic = 'force-dynamic';

/** GET /api/earnings-calendar — estimated upcoming earnings dates for every
 * followed company. Every entry is explicitly labeled as an estimate or
 * "no prior call on record" — never a fabricated confirmed date. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const calendar = await getEarningsCalendar(user.id);
  return NextResponse.json(calendar);
}
