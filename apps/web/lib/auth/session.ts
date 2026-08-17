import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import type { User } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Session tokens: a random 32-byte value is the actual cookie the browser
 * holds; only its SHA-256 hash is ever written to the database
 * (`Session.tokenHash`) — the same "never persist the literal secret"
 * discipline as password.ts. A stolen database dump alone can never be
 * replayed as a valid session cookie.
 *
 * Split into two halves on purpose: `issueSession`/`resolveSessionToken`/
 * `revokeSessionToken` are plain DB logic, directly testable against a real
 * Postgres database with no request context. `createSessionCookie`/
 * `getCurrentUser`/`destroySessionCookie` are the thin wrappers that touch
 * `next/headers`'s `cookies()` — only usable inside a Server Component or
 * Route Handler, so they're left untested glue, same as this codebase's
 * existing API routes.
 */

export const SESSION_COOKIE_NAME = 'atlas_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({ data: { userId, tokenHash, expiresAt } });

  return { token, expiresAt };
}

/** Resolves a raw session token to its owning user, or null if the token is
 * unknown or has expired. An expired session is opportunistically deleted
 * rather than merely ignored, so `sessions` doesn't grow unbounded. */
export async function resolveSessionToken(token: string): Promise<User | null> {
  const tokenHash = hashSessionToken(token);
  const session = await db.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return session.user;
}

export async function revokeSessionToken(token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

// ---------------------------------------------------------------------------
// Cookie-bound wrappers
// ---------------------------------------------------------------------------

export async function createSessionCookie(userId: string): Promise<void> {
  const { token, expiresAt } = await issueSession(userId);
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return resolveSessionToken(token);
}

export async function destroySessionCookie(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (token) await revokeSessionToken(token);
  cookies().set(SESSION_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
}
