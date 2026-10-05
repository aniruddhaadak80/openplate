/**
 * Best-effort abuse control for anonymous writes.
 *
 * The honest limitation: a serverless deployment runs many short-lived instances,
 * so an in-memory counter is a speed bump, not a wall. It reliably stops a
 * single runaway client and honestly costs nothing; it cannot be relied on to
 * stop a distributed one. Anything that needs a hard limit wants a shared store
 * (Upstash Redis, Vercel KV, or the rate limiting on the platform edge), which
 * this project does not assume exists.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const GLOBAL_KEY = "__openPlateRateLimits";
type GlobalWithBuckets = typeof globalThis & { [GLOBAL_KEY]?: Map<string, Bucket> };

function buckets(): Map<string, Bucket> {
  const scope = globalThis as GlobalWithBuckets;
  if (!scope[GLOBAL_KEY]) scope[GLOBAL_KEY] = new Map();
  return scope[GLOBAL_KEY];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window rolls over. */
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const store = buckets();

  // Opportunistic sweep: keeps a long-lived local dev server from accumulating
  // an entry for every key it has ever seen.
  if (store.size > 5000) {
    for (const [entryKey, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(entryKey);
    }
  }

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: options.limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Writes are the expensive, abusable operations, so they get the tighter budget. */
export const WRITE_LIMIT = { limit: 30, windowMs: 60_000 };
export const READ_LIMIT = { limit: 120, windowMs: 60_000 };
