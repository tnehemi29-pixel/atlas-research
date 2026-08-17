import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { getFilingMonitor } from '@/lib/services/filingMonitorService';

export const dynamic = 'force-dynamic';

/** GET /api/filing-monitor — recent SEC filings across every followed company. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const monitor = await getFilingMonitor(user.id);
  return NextResponse.json(monitor);
}
