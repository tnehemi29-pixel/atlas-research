import { NextResponse } from 'next/server';
import type { User } from '@prisma/client';
import { getCurrentUser } from './session';

/**
 * Thrown by `requireUser()` when no valid session exists — API routes catch
 * this exactly like every other domain-specific "not found"/"not
 * configured" error class elsewhere in this codebase (see
 * FilingNotFoundError, ResearchCompanyNotFoundError, etc.) and translate it
 * to a 401. Never a silent fallback to "no user" — every route that needs a
 * user either gets one or the request fails.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Not authenticated.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function unauthorizedResponse(message = 'Not authenticated.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}
