/**
 * Rate limiting for sensitive API routes using Upstash Redis.
 * Falls back to a simple in-memory store if Upstash env vars are not set
 * (development only; not suitable for multi-instance production).
 *
 * Note: The Upstash limiter is initialised once at module load with a fixed
 * sliding window of DEFAULT_MAX requests per DEFAULT_WINDOW_MS. Callers may
 * pass different values to `rateLimit()`, which are used by the in-memory
 * fallback; the Upstash window is fixed at module-init time.
 */
import { NextRequest } from "next/server";

/** Default window size (1 minute). */
const DEFAULT_MAX = 20;
const DEFAULT_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// Upstash-based limiter (production)
// ---------------------------------------------------------------------------
let upstashLimiter: {
  limit: (key: string) => Promise<{ success: boolean; remaining: number }>;
} | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  // Dynamic import so the build doesn't fail when Upstash is not configured
  (async () => {
    const { Redis } = await import("@upstash/redis");
    const { Ratelimit } = await import("@upstash/ratelimit");
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    upstashLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(DEFAULT_MAX, "1 m"),
      analytics: false,
    });
  })();
}

// ---------------------------------------------------------------------------
// In-memory fallback (dev only)
// ---------------------------------------------------------------------------
const memStore = new Map<string, { count: number; resetAt: number }>();

function memLimit(
  key: string,
  max: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || entry.resetAt < now) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: max - 1 };
  }
  entry.count += 1;
  const remaining = Math.max(0, max - entry.count);
  return { success: entry.count <= max, remaining };
}

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

/**
 * Rate-limit a request by the authenticated user ID (or IP as fallback).
 * @param req     The incoming request
 * @param id      A unique identifier for the subject (e.g. clerkId)
 * @param max     Max requests per window (default 20)
 * @param windowMs Window size in ms (default 60 000)
 * @returns       Response with 429 if rate limited, otherwise null
 */
export async function rateLimit(
  req: NextRequest,
  id: string,
  max = DEFAULT_MAX,
  windowMs = DEFAULT_WINDOW_MS
): Promise<Response | null> {
  const key = `rl:${id}`;

  let success: boolean;
  let remaining: number;

  if (upstashLimiter) {
    const result = await upstashLimiter.limit(key);
    success = result.success;
    remaining = result.remaining;
  } else {
    const result = memLimit(key, max, windowMs);
    success = result.success;
    remaining = result.remaining;
  }

  if (!success) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(windowMs / 1000)),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  }

  return null; // not rate-limited
}
