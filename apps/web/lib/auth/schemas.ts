import { z } from 'zod';
import type { User } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  name: z.string().trim().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

/** Never let `passwordHash` — or any future sensitive column — leak into an
 * API response. Every auth route returns through this, not the raw Prisma row. */
export function toSafeUser(user: User): SafeUser {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString() };
}
