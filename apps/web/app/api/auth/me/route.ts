import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { toSafeUser } from '@/lib/auth/schemas';

export const dynamic = 'force-dynamic';

/** GET /api/auth/me
 * "Am I logged in?" is a normal, expected check — always 200, with `user:
 * null` when there's no session, never a 401 for simply asking. */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ? toSafeUser(user) : null });
}
