import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionCookie } from '@/lib/auth/session';
import { loginSchema, toSafeUser } from '@/lib/auth/schemas';

export const dynamic = 'force-dynamic';

/** POST /api/auth/login
 * Deliberately generic "Invalid email or password" for both an unknown
 * email and a wrong password — never reveals which one was incorrect. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  await createSessionCookie(user.id);

  return NextResponse.json(toSafeUser(user));
}
