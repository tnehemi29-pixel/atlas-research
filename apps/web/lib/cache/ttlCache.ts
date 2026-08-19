/**
 * In-process TTL cache for hot, short-lived provider responses (e.g. repeated
 * autocomplete keystrokes hitting the same prefix). This is a single-instance
 * stand-in for the Redis cache the architecture calls for — same get/set/ttl
 * shape, so swapping in `@upstash/redis` later is an implementation change
 * inside this file, not a change to any caller.
 *
 * SERVERLESS LIMITATION (documented, not fixed here): on a host like Vercel,
 * each cold-started function instance gets its own empty `store` — a cache
 * hit here only ever happens within one warm instance's own lifetime, never
 * shared across concurrent invocations. This is NOT a correctness issue
 * (every caller already re-fetches from the real provider on a miss), only
 * a lost efficiency opportunity: expect a lower effective hit rate, and
 * correspondingly more upstream FMP/SEC requests, on serverless than on a
 * traditional long-lived server process. Left as-is deliberately — swapping
 * in a real shared cache is a decision to make once the actual hosting
 * pattern (and its cost/latency tradeoffs) is settled, not a default to
 * reach for pre-emptively.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private readonly defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}
