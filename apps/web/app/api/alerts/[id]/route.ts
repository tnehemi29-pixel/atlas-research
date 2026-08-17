import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { AlertNotFoundError, deleteAlert, setAlertActive } from '@/lib/services/alertService';

export const dynamic = 'force-dynamic';

/** PATCH /api/alerts/[id] — { isActive } */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive must be a boolean.' }, { status: 400 });
  }

  try {
    const alert = await setAlertActive(user.id, params.id, body.isActive);
    return NextResponse.json(alert);
  } catch (error) {
    if (error instanceof AlertNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}

/** DELETE /api/alerts/[id] */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    await deleteAlert(user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AlertNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
