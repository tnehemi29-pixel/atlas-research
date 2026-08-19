import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var prismaDirectGlobal: PrismaClient | undefined;
}

export const db = globalThis.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = db;
}

/**
 * A second client, connected via DIRECT_URL instead of the pooled
 * DATABASE_URL — reserved for the narrow case of a genuinely multi-statement
 * Prisma *interactive* transaction (`$transaction(async (tx) => {...})`),
 * which needs one connection held open across several sequential queries.
 * Neon's pooled endpoint runs PgBouncer in transaction-pooling mode, which
 * doesn't support holding a connection across an interactive transaction
 * this way — DIRECT_URL bypasses the pooler entirely for exactly that case.
 *
 * Every other query in the app should keep using the default `db` export
 * above; this client exists ONLY for that narrow need, not as a general
 * alternative — a direct (non-pooled) connection doesn't scale to ordinary
 * per-request serverless query volume, which is exactly why the pooled `db`
 * client remains the default everywhere else.
 */
export const dbDirect = globalThis.prismaDirectGlobal ?? new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaDirectGlobal = dbDirect;
}
