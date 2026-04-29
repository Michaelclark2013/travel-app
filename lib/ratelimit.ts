// Two-tier rate limiter:
//   1. In-memory token bucket — works on every deploy, per-instance.
//   2. Upstash Redis — shared across instances when configured.
//
// The in-memory tier is good enough to stop the obvious 1000-req/sec curl loop
// even on a cold deploy. Configuring Upstash bumps protection to global.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------- Per-route policies ----------------
//
// Tuned for a free-tier app. Feel free to bump in prod.

export type RateBucket =
  | "default" // generic API
  | "search" // /api/flights, /api/hotels, /api/directions
  | "auth" // /api/account/*, signup-related
  | "ingest" // /api/wallet/ingest
  | "share"; // /api/wallet/share

const POLICY: Record<RateBucket, { perMinute: number; burst: number }> = {
  default: { perMinute: 60, burst: 20 },
  search: { perMinute: 30, burst: 10 },
  auth: { perMinute: 10, burst: 5 },
  ingest: { perMinute: 20, burst: 5 },
  share: { perMinute: 30, burst: 10 },
};

// ---------------- Upstash (shared) tier ----------------

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const upstashClient: Redis | null = url && token ? new Redis({ url, token }) : null;
const upstashLimiters: Map<RateBucket, Ratelimit> = new Map();

function upstashLimiter(bucket: RateBucket): Ratelimit | null {
  if (!upstashClient) return null;
  let l = upstashLimiters.get(bucket);
  if (l) return l;
  const p = POLICY[bucket];
  l = new Ratelimit({
    redis: upstashClient,
    limiter: Ratelimit.slidingWindow(p.perMinute, "1 m"),
    analytics: true,
    prefix: `voyage:rl:${bucket}`,
  });
  upstashLimiters.set(bucket, l);
  return l;
}

// ---------------- In-memory tier ----------------
//
// Token bucket per (key, bucket). Survives in the Node.js worker across
// requests. On Vercel each instance keeps its own counter — not shared, but
// effective at stopping single-host floods.

type Bucket = { tokens: number; updatedAt: number };
const memBuckets = new Map<string, Bucket>();
const MAX_KEYS = 5_000; // simple cap to avoid runaway memory

function memCheck(
  key: string,
  bucket: RateBucket
): { ok: boolean; remaining: number; resetMs: number } {
  const policy = POLICY[bucket];
  const refillRatePerMs = policy.perMinute / 60_000;
  const max = policy.burst + policy.perMinute; // capacity
  const now = Date.now();
  const k = `${bucket}:${key}`;

  let b = memBuckets.get(k);
  if (!b) {
    if (memBuckets.size >= MAX_KEYS) {
      // Evict an arbitrary stale key.
      const it = memBuckets.keys().next();
      if (!it.done) memBuckets.delete(it.value);
    }
    b = { tokens: max, updatedAt: now };
    memBuckets.set(k, b);
  } else {
    const elapsed = now - b.updatedAt;
    b.tokens = Math.min(max, b.tokens + elapsed * refillRatePerMs);
    b.updatedAt = now;
  }

  if (b.tokens < 1) {
    const msUntilOne = (1 - b.tokens) / refillRatePerMs;
    return { ok: false, remaining: 0, resetMs: Math.ceil(msUntilOne) };
  }
  b.tokens -= 1;
  return { ok: true, remaining: Math.floor(b.tokens), resetMs: 0 };
}

// ---------------- Public API ----------------

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until reset (best-effort). */
  reset: number;
  /** Which tier produced the verdict — useful for debugging. */
  tier: "memory" | "upstash";
};

export async function rateLimit(
  key: string,
  bucket: RateBucket = "default"
): Promise<RateLimitResult> {
  // Always check memory tier first — fast and free.
  const mem = memCheck(key, bucket);
  if (!mem.ok) {
    return {
      ok: false,
      limit: POLICY[bucket].perMinute,
      remaining: 0,
      reset: Math.ceil(mem.resetMs / 1000),
      tier: "memory",
    };
  }

  // Upstash tier (only when configured) for cross-instance enforcement.
  const u = upstashLimiter(bucket);
  if (u) {
    const r = await u.limit(`${bucket}:${key}`);
    return {
      ok: r.success,
      limit: r.limit,
      remaining: r.remaining,
      reset: Math.ceil((r.reset - Date.now()) / 1000),
      tier: "upstash",
    };
  }
  return {
    ok: true,
    limit: POLICY[bucket].perMinute,
    remaining: mem.remaining,
    reset: 0,
    tier: "memory",
  };
}

// ---------------- Helpers ----------------

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "anon";
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(r.reset),
    "X-RateLimit-Tier": r.tier,
    ...(r.ok ? {} : { "Retry-After": String(Math.max(1, r.reset)) }),
  };
}

export function tooManyRequestsResponse(r: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      retryAfterSeconds: Math.max(1, r.reset),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...rateLimitHeaders(r),
      },
    }
  );
}
