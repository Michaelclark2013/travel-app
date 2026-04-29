// lib/admin/posthog-server.ts — Track 4 server-side PostHog wrapper.
//
// WHAT
//   Thin client over the PostHog HogQL/insights HTTP API for the
//   /admin/metrics dashboard. Two responsibilities:
//     1. Authenticate with the *personal* API key (not the project key — we
//        need read access).
//     2. Cache responses in Upstash Redis for 60s, keyed by query, so a
//        burst of dashboard renders doesn't quota-burn the PostHog API.
//
// WHY a server module
//   The personal API key MUST never leave the server. The client-side
//   wrapper (lib/analytics.ts) is the only place that touches the public
//   project key.
//
// ENV VARS
//   POSTHOG_PERSONAL_API_KEY — required for any read.
//   POSTHOG_PROJECT_ID       — required for any read.
//   POSTHOG_HOST             — optional, defaults to https://us.i.posthog.com.
//   UPSTASH_REDIS_REST_URL   — already present (lib/ratelimit.ts).
//   UPSTASH_REDIS_REST_TOKEN — already present.

import { Redis } from "@upstash/redis";

const HOST =
  process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;

const CACHE_TTL_SECONDS = 60;

// ---------------------------------------------------------------------------
// Cache layer — same Upstash creds as the rate limiter. Falls back to an
// in-memory Map when Redis isn't configured so dev still works.
// ---------------------------------------------------------------------------
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const upstash: Redis | null =
  upstashUrl && upstashToken
    ? new Redis({ url: upstashUrl, token: upstashToken })
    : null;

type CacheEntry = { value: unknown; expires: number };
const memCache = new Map<string, CacheEntry>();

async function cacheGet<T>(key: string): Promise<T | null> {
  if (upstash) {
    try {
      const v = await upstash.get<T>(key);
      return v ?? null;
    } catch {
      /* fall through to memory */
    }
  }
  const entry = memCache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    memCache.delete(key);
    return null;
  }
  return entry.value as T;
}

async function cacheSet(key: string, value: unknown): Promise<void> {
  if (upstash) {
    try {
      await upstash.set(key, value, { ex: CACHE_TTL_SECONDS });
      return;
    } catch {
      /* fall through to memory */
    }
  }
  memCache.set(key, {
    value,
    expires: Date.now() + CACHE_TTL_SECONDS * 1000,
  });
}

// ---------------------------------------------------------------------------
// Public: posthogServerEnabled — feature flag for callers. Pages render an
// inline "PostHog not configured" hint when this is false instead of
// throwing.
// ---------------------------------------------------------------------------
export function posthogServerEnabled(): boolean {
  return !!(KEY && PROJECT_ID);
}

// ---------------------------------------------------------------------------
// Public: hogql<T>(query, vars?, cacheKey?)
//
// Runs a HogQL query against the configured project. `cacheKey` defaults to
// a stable hash of (query + vars) so two callers asking the same question
// share the cache slot. Set cacheKey to a literal string to force isolation
// per dashboard card.
// ---------------------------------------------------------------------------
export async function hogql<T = unknown>(
  query: string,
  vars: Record<string, unknown> = {},
  cacheKey?: string
): Promise<T | null> {
  if (!KEY || !PROJECT_ID) return null;

  const k = `voyage:posthog:${cacheKey ?? hashKey(query, vars)}`;
  const cached = await cacheGet<T>(k);
  if (cached !== null) return cached;

  const res = await fetch(`${HOST}/api/projects/${PROJECT_ID}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query, values: vars },
    }),
    // Per-card isolation: each card gets its own fetch, no shared promise.
    cache: "no-store",
  });

  if (!res.ok) {
    // Don't throw — the dashboard cards render their own "no data" state.
    console.warn(
      "[posthog-server] hogql request failed",
      res.status,
      await res.text().catch(() => "")
    );
    return null;
  }
  const json = (await res.json()) as T;
  await cacheSet(k, json);
  return json;
}

// ---------------------------------------------------------------------------
// Public: insight(insightId, cacheKey?) — fetch a saved PostHog insight
// directly. Cheaper than HogQL when an insight is already curated.
// ---------------------------------------------------------------------------
export async function insight<T = unknown>(
  insightId: number,
  cacheKey?: string
): Promise<T | null> {
  if (!KEY || !PROJECT_ID) return null;

  const k = `voyage:posthog:insight:${cacheKey ?? insightId}`;
  const cached = await cacheGet<T>(k);
  if (cached !== null) return cached;

  const res = await fetch(
    `${HOST}/api/projects/${PROJECT_ID}/insights/${insightId}/`,
    {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    console.warn("[posthog-server] insight request failed", res.status);
    return null;
  }
  const json = (await res.json()) as T;
  await cacheSet(k, json);
  return json;
}

// ---------------------------------------------------------------------------
// Tiny stable hash so two equivalent (query, vars) pairs share a cache slot
// without us pulling in a crypto dependency. djb2 — collisions are fine; the
// worst case is a stale-but-still-valid 60s TTL on a different query.
// ---------------------------------------------------------------------------
function hashKey(query: string, vars: Record<string, unknown>): string {
  const s = query + "|" + JSON.stringify(vars);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
