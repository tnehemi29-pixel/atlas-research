import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { unsaveReport } from '@/lib/services/savedReportService';

export const dynamic = 'force-dynamic';

/** DELETE /api/reports/saved/[reportId] */
export async function DELETE(_request: Request, { params }: { params: { reportId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  await unsaveReport(user.id, params.reportId);
  return NextResponse.json({ ok: true });
}
