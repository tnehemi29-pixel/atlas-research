import { NextResponse } from 'next/server';

/**
 * Deliberately simple, single-instance, in-memory rate limiting.
 *
 * HONEST LIMITATION: on serverless hosting (e.g. Vercel), each cold-started
 * function instance gets its own copy of the `buckets` map below, and
 * concurrent invocations may land on different instances entirely. This is
 * NOT a reliable distributed rate limit — a determined attacker spreading
 * requests across many concurrent cold starts can exceed the configured
 * limit. A real distributed guarantee requires a shared, low-latency store
 * external to the request process itself (e.g. Upstash Redis with
 * `@upstash/ratelimit`, or a similar KV-backed limiter) — deliberately not
 * added here per instruction, to avoid pulling in a dependency and an
 * external service requirement before that's actually decided on.
 *
 * What this DOES provide, honestly: a real, zero-dependency defense-in-depth
 * layer that blocks casual scripted abuse from a single client hitting a
 * single warm instance (the common case at low-to-moderate traffic, and the
 * only case at all on a traditional persistent Node server) — strictly
 * better than no protection, never worse than doing nothing, and never a
 * false sense of guaranteed security against a sophisticated attacker.
 *
 * Fails OPEN by design: any unexpected error inside this module allows the
 * request through rather than blocking it. This is a defense-in-depth layer
 * bolted onto login/registration/AI generation — a bug here must never turn
 * into an outage of the actual feature it's protecting.
 */

export interface RateLimitConfig {
  /** Max allowed requests within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry; 0 when allowed. */
  retryAfterSeconds: number;
}

/** Authentication endpoints (login/register) — generous enough that a real
 * user mistyping a password a few times is never blocked, tight enough to
 * blunt scripted credential-stuffing / registration-spam attempts. */
export const AUTH_RATE_LIMIT: RateLimitConfig = { limit: 10, windowMs: 5 * 60 * 1000 };

/** AI-generation / AI-cost routes (report/memo generation, filing & earnings
 * AI analysis and comparison, workspace/thesis assistants, research digest)
 * — bounds real Anthropic API spend per identity, not meant to be hit by
 * normal interactive use. */
export const AI_RATE_LIMIT: RateLimitConfig = { limit: 20, windowMs: 60 * 60 * 1000 };

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();

/** Bounds memory on a long-lived warm instance without a timer (which isn't
 * reliable on serverless anyway) — an opportunistic sweep triggered by size
 * rather than a background interval. */
const MAX_TRACKED_KEYS = 10_000;

function sweepExpired(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

/**
 * `bucket` distinguishes the protection category (e.g. 'auth' vs 'ai') so
 * the same client identifier can be independently limited per category.
 * `key` identifies the caller — an IP for unauthenticated routes, a user id
 * for authenticated ones (see getClientIp / route usage below).
 */
export function checkRateLimit(bucket: string, key: string, config: RateLimitConfig): RateLimitResult {
  try {
    const now = Date.now();
    sweepExpired(now);

    const mapKey = `${bucket}:${key}`;
    const entry = buckets.get(mapKey);

    if (!entry || now >= entry.resetAt) {
      buckets.set(mapKey, { count: 1, resetAt: now + config.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (entry.count >= config.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    }

    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Best-effort client IP for unauthenticated routes. Vercel sets
 * `x-forwarded-for` reliably; falls back to a shared bucket (rather than
 * throwing) when it's absent, e.g. in local dev. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const first = forwardedFor?.split(',')[0]?.trim();
  return first || 'unknown';
}

export function rateLimitResponse(retryAfterSeconds: number, message = 'Too many requests. Please try again shortly.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
}
