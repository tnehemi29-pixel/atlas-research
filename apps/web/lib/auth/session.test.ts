import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from './password';
import { hashSessionToken, issueSession, resolveSessionToken, revokeSessionToken } from './session';

/**
 * Integration test against the real local Postgres — session issuance,
 * resolution, expiry, and revocation are all claims about actual stored
 * rows, not something a mock can verify. Only the cookie-bound wrappers
 * (which need a Next.js request context) are left untested, matching how
 * this codebase already treats thin route-handler glue.
 */

const TEST_EMAIL = 'zz-session-test@example.com';

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
}

describe('session', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('issues a session whose raw token is never stored, only its hash', async () => {
    const passwordHash = await hashPassword('irrelevant');
    const user = await db.user.create({ data: { email: TEST_EMAIL, passwordHash } });

    const { token, expiresAt } = await issueSession(user.id);
    expect(token).toHaveLength(64); // 32 bytes, hex-encoded
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const stored = await db.session.findUnique({ where: { tokenHash: hashSessionToken(token) } });
    expect(stored).not.toBeNull();
    expect(stored?.userId).toBe(user.id);

    const rawTokenStoredAnywhere = await db.session.findFirst({ where: { tokenHash: token } });
    expect(rawTokenStoredAnywhere).toBeNull();
  });

  it('resolves a valid token back to its owning user', async () => {
    const passwordHash = await hashPassword('irrelevant');
    const user = await db.user.create({ data: { email: `resolve-${TEST_EMAIL}`, passwordHash } });
    const { token } = await issueSession(user.id);

    const resolved = await resolveSessionToken(token);
    expect(resolved?.id).toBe(user.id);

    await db.user.delete({ where: { id: user.id } });
  });

  it('returns null for an unknown token', async () => {
    expect(await resolveSessionToken('a'.repeat(64))).toBeNull();
  });

  it('returns null and deletes the row for an expired session', async () => {
    const passwordHash = await hashPassword('irrelevant');
    const user = await db.user.create({ data: { email: `expired-${TEST_EMAIL}`, passwordHash } });
    const { token } = await issueSession(user.id);

    await db.session.update({
      where: { tokenHash: hashSessionToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await resolveSessionToken(token)).toBeNull();
    expect(await db.session.findUnique({ where: { tokenHash: hashSessionToken(token) } })).toBeNull();

    await db.user.delete({ where: { id: user.id } });
  });

  it('revokes a session so it can no longer be resolved', async () => {
    const passwordHash = await hashPassword('irrelevant');
    const user = await db.user.create({ data: { email: `revoke-${TEST_EMAIL}`, passwordHash } });
    const { token } = await issueSession(user.id);

    expect(await resolveSessionToken(token)).not.toBeNull();
    await revokeSessionToken(token);
    expect(await resolveSessionToken(token)).toBeNull();

    await db.user.delete({ where: { id: user.id } });
  });
});
