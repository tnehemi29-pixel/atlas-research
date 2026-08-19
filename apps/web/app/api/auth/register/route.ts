import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSessionCookie } from '@/lib/auth/session';
import { registerSchema, toSafeUser } from '@/lib/auth/schemas';
import { AUTH_RATE_LIMIT, checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/** POST /api/auth/register
 * Creates a new user, hashes the password (never stored or logged in
 * plaintext), and immediately signs them in via a session cookie.
 * Rate-limited by IP (no account exists yet to key on) — blunts scripted
 * registration spam without blocking normal signup. */
export async function POST(request: Request) {
  const { allowed, retryAfterSeconds } = checkRateLimit('auth', getClientIp(request), AUTH_RATE_LIMIT);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }

  const { email, password, name } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await db.user.create({ data: { email, passwordHash, name: name ?? null } });

  await createSessionCookie(user.id);

  return NextResponse.json(toSafeUser(user), { status: 201 });
}
