/**
 * In-process TTL cache for hot, short-lived provider responses (e.g. repeated
 * autocomplete keystrokes hitting the same prefix). This is a single-instance
 * stand-in for the Redis cache the architecture calls for — same get/set/ttl
 * shape, so swapping in `@upstash/redis` later is an implementation change
 * inside this file, not a change to any caller.
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
