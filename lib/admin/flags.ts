// lib/admin/flags.ts — Track 6 feature-flag evaluation.
//
// WHAT
//   - getFlag(key, ctx?)   — evaluate a flag. Cached for 5s in Upstash to
//                            keep middleware hot-path cheap. Falls back to
//                            an in-memory micro-cache if Upstash isn't
//                            configured.
//   - setFlag(key, partial) — admin-only mutation; audit-wrapped, busts
//                            cache.
//   - evaluateFlag(flag, ctx) — pure function. Boolean returns value;
//                            percentage hashes (key + userId) into [0,100);
//                            cohort checks ctx fields against target.
//                            Kill-switches always force "off".
//
// EDGE-RUNTIME SAFETY
//   This file is imported by middleware.ts which runs on the Edge runtime.
//   It MUST NOT use any node:* imports — only Web APIs (crypto.subtle, fetch,
//   TextEncoder, Uint8Array). The Upstash REST client is fetch-based and
//   already Edge-safe; we use it directly rather than going through
//   @upstash/redis (whose helper layer has Node-specific code paths in some
//   versions).
//
// CACHE MODEL
//   Cache key: voyage:flag:<key>
//   TTL:      5 seconds (FLAG_CACHE_TTL_S)
//   Encoding: JSON of the flag row OR the literal string "null" for misses
//             (so a missing flag doesn't hammer Postgres).
//
// ENV VARS
//   UPSTASH_REDIS_REST_URL    — optional, enables shared cache.
//   UPSTASH_REDIS_REST_TOKEN  — optional, paired with the URL above.
//   SUPABASE_SERVICE_ROLE_KEY — required for the source of truth.
//   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL — Supabase project URL.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type FlagKind = "boolean" | "percentage" | "cohort" | "kill_switch";

export type FlagRow = {
  key: string;
  description: string | null;
  kind: FlagKind;
  value: Record<string, unknown>;
  target: Record<string, unknown> | null;
  enabled: boolean;
  created_by: string | null;
  updated_at: string;
};

export type FlagContext = {
  userId?: string;
  country?: string;
  /** Override percentage check for testing — clamped to [0,100). */
  percentage?: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const FLAG_CACHE_TTL_S = 5;
const CACHE_PREFIX = "voyage:flag:";
const NULL_SENTINEL = "__null__";

// In-memory micro-cache as a fallback (or hot-path layer in front of Upstash).
// 5s TTL, capped at 256 entries. Per-instance only.
type MemCacheEntry = { row: FlagRow | null; expiresAt: number };
const memCache = new Map<string, MemCacheEntry>();
const MEM_CACHE_MAX = 256;

// ---------------------------------------------------------------------------
// Upstash REST helpers — fetch-based to stay Edge-safe.
// ---------------------------------------------------------------------------
function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function upstashGet(key: string): Promise<string | null> {
  const env = upstashEnv();
  if (!env) return null;
  try {
    const res = await fetch(`${env.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${env.token}` },
      // Don't let Next's fetch caching interfere; we manage TTL via SET EX.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: string | null };
    return data.result ?? null;
  } catch {
    return null;
  }
}

async function upstashSetEx(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  const env = upstashEnv();
  if (!env) return;
  try {
    await fetch(`${env.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSeconds}`, {
      headers: { Authorization: `Bearer ${env.token}` },
      cache: "no-store",
    });
  } catch {
    /* swallow — cache is best-effort. */
  }
}

async function upstashDel(key: string): Promise<void> {
  const env = upstashEnv();
  if (!env) return;
  try {
    await fetch(`${env.url}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${env.token}` },
      cache: "no-store",
    });
  } catch {
    /* swallow */
  }
}

// ---------------------------------------------------------------------------
// Supabase REST fetch — also Edge-safe (no @supabase/supabase-js import here
// because that pulls Node-only fetch shims in some bundlers; PostgREST over
// fetch is the smaller surface).
// ---------------------------------------------------------------------------
function supabaseEnv(): { url: string; key: string } | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function fetchFlagFromDb(key: string): Promise<FlagRow | null> {
  const env = supabaseEnv();
  if (!env) return null;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/feature_flags?key=eq.${encodeURIComponent(key)}&select=*`,
      {
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as FlagRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory cache helpers.
// ---------------------------------------------------------------------------
function memGet(key: string): { row: FlagRow | null } | null {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memCache.delete(key);
    return null;
  }
  return { row: entry.row };
}

function memSet(key: string, row: FlagRow | null): void {
  if (memCache.size >= MEM_CACHE_MAX) {
    const it = memCache.keys().next();
    if (!it.done) memCache.delete(it.value);
  }
  memCache.set(key, {
    row,
    expiresAt: Date.now() + FLAG_CACHE_TTL_S * 1000,
  });
}

function memDel(key: string): void {
  memCache.delete(key);
}

// ---------------------------------------------------------------------------
// Pure evaluator.
//
// Priority (highest first):
//   1. !enabled              → false (flag effectively dormant)
//   2. kind === kill_switch  → !value.killed (killed=true means feature off)
//   3. kind === boolean      → value.on
//   4. kind === percentage   → hash(key+userId) % 100 < value.percent
//   5. kind === cohort       → ctx fields match target rules
// ---------------------------------------------------------------------------
export function evaluateFlag(
  flag: FlagRow | null,
  ctx: FlagContext = {}
): boolean {
  if (!flag) return false;
  if (!flag.enabled) return false;

  switch (flag.kind) {
    case "kill_switch":
      // A kill switch tracks the *killed* state; when killed, the underlying
      // feature should be disabled. evaluateFlag returns true if the
      // underlying feature is "active" — so we invert.
      return !boolValue(flag.value.killed, false);

    case "boolean":
      return boolValue(flag.value.on, false);

    case "percentage": {
      const percent = clampPercent(flag.value.percent);
      if (percent <= 0) return false;
      if (percent >= 100) return true;
      // Override (testing).
      if (typeof ctx.percentage === "number") {
        return ctx.percentage < percent;
      }
      const stable = stableHashPercent(`${flag.key}:${ctx.userId ?? "anon"}`);
      return stable < percent;
    }

    case "cohort":
      return evaluateCohort(flag.target ?? {}, flag.value, ctx);

    default:
      return false;
  }
}

function boolValue(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

function clampPercent(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// stableHashPercent — Web Crypto SHA-256 over the input, take the first 4
// bytes as a uint32, modulo 100. Pure, deterministic, no node:* required.
//
// We CAN'T await inside evaluateFlag (it must stay sync for clean middleware
// flow), so this synchronous hash uses a tiny fallback FNV-1a — collisions
// are fine for a 100-bucket distribution. Async callers that want SHA-256
// can call stableHashPercentAsync below for the cryptographic version.
function stableHashPercent(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Convert to unsigned and pick a percent.
  const u = h >>> 0;
  return u % 100;
}

/** Cryptographic version, for callers that have an async context. */
export async function stableHashPercentAsync(input: string): Promise<number> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  // First 4 bytes -> uint32.
  const u =
    (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  const unsigned = u >>> 0;
  return unsigned % 100;
}

function evaluateCohort(
  target: Record<string, unknown>,
  value: Record<string, unknown>,
  ctx: FlagContext
): boolean {
  const matchMode =
    typeof value.match === "string" && value.match === "all" ? "all" : "any";

  const checks: boolean[] = [];

  // userIds: explicit allowlist.
  if (Array.isArray(target.userIds)) {
    const list = target.userIds as unknown[];
    checks.push(!!ctx.userId && list.includes(ctx.userId));
  }
  // country: list of country codes.
  if (Array.isArray(target.country)) {
    const list = target.country as unknown[];
    checks.push(!!ctx.country && list.includes(ctx.country));
  }
  // No checks at all → vacuously matches when "any" (so an empty cohort with
  // enabled=true acts like a boolean true), false when "all" (no rule = no
  // match) — matches the principle of least surprise.
  if (checks.length === 0) return matchMode === "any";

  return matchMode === "all"
    ? checks.every(Boolean)
    : checks.some(Boolean);
}

// ---------------------------------------------------------------------------
// getFlag — cached read + evaluation.
//
// Returns the EVALUATED boolean. Use getFlagRow if you need the raw row.
// ---------------------------------------------------------------------------
export async function getFlag(
  key: string,
  ctx: FlagContext = {}
): Promise<boolean> {
  const row = await getFlagRow(key);
  return evaluateFlag(row, ctx);
}

export async function getFlagRow(key: string): Promise<FlagRow | null> {
  // 1) In-memory micro-cache.
  const mem = memGet(key);
  if (mem) return mem.row;

  // 2) Upstash shared cache.
  const cacheKey = CACHE_PREFIX + key;
  const cached = await upstashGet(cacheKey);
  if (cached !== null) {
    if (cached === NULL_SENTINEL) {
      memSet(key, null);
      return null;
    }
    try {
      const row = JSON.parse(cached) as FlagRow;
      memSet(key, row);
      return row;
    } catch {
      // Bad cached payload — fall through to DB.
    }
  }

  // 3) Source of truth.
  const row = await fetchFlagFromDb(key);
  await upstashSetEx(
    cacheKey,
    row ? JSON.stringify(row) : NULL_SENTINEL,
    FLAG_CACHE_TTL_S
  );
  memSet(key, row);
  return row;
}

// ---------------------------------------------------------------------------
// listFlags — used by the admin UI; bypasses the per-key cache and goes
// straight to Postgres (the result set is not cached because it can change
// often during a rollout).
// ---------------------------------------------------------------------------
export async function listFlags(): Promise<FlagRow[]> {
  const env = supabaseEnv();
  if (!env) return [];
  try {
    const res = await fetch(
      `${env.url}/rest/v1/feature_flags?select=*&order=key.asc`,
      {
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    return (await res.json()) as FlagRow[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// setFlag — write + cache bust. Audit-wrapping happens in the route handler
// (which has access to next/headers); this function is the low-level put.
// ---------------------------------------------------------------------------
export type FlagPatch = Partial<{
  description: string | null;
  kind: FlagKind;
  value: Record<string, unknown>;
  target: Record<string, unknown> | null;
  enabled: boolean;
  created_by: string | null;
}>;

export async function setFlag(
  key: string,
  patch: FlagPatch
): Promise<FlagRow | null> {
  const env = supabaseEnv();
  if (!env) return null;

  const body = {
    key,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  try {
    const res = await fetch(
      `${env.url}/rest/v1/feature_flags?on_conflict=key`,
      {
        method: "POST",
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as FlagRow[];
    const row = rows[0] ?? null;
    await bustFlagCache(key);
    return row;
  } catch {
    return null;
  }
}

export async function deleteFlag(key: string): Promise<boolean> {
  const env = supabaseEnv();
  if (!env) return false;
  try {
    const res = await fetch(
      `${env.url}/rest/v1/feature_flags?key=eq.${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          Prefer: "return=minimal",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return false;
    await bustFlagCache(key);
    return true;
  } catch {
    return false;
  }
}

export async function bustFlagCache(key: string): Promise<void> {
  memDel(key);
  await upstashDel(CACHE_PREFIX + key);
}
