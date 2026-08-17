import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { listSavedReports, saveReport, SavedReportTargetNotFoundError } from '@/lib/services/savedReportService';

export const dynamic = 'force-dynamic';

/** GET /api/reports/saved */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const saved = await listSavedReports(user.id);
  return NextResponse.json(saved);
}

/** POST /api/reports/saved — { researchReportId } */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const researchReportId = typeof body?.researchReportId === 'string' ? body.researchReportId : '';
  if (!researchReportId) return NextResponse.json({ error: 'researchReportId is required.' }, { status: 400 });

  try {
    const saved = await saveReport(user.id, researchReportId);
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    if (error instanceof SavedReportTargetNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
