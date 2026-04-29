// lib/admin/patterns.ts — Track 3 deterministic deny-list evaluator.
//
// WHAT
//   evaluate({ content, ip, fingerprint, image }) — checks every relevant
//   pattern_bans row and returns the FIRST match, or null if nothing fires.
//   The classify endpoint calls this BEFORE the LLM so we never spend Claude
//   tokens on known-bad content.
//
// WHY a single evaluator
//   Six ban kinds, but each is a constant-time table lookup: hashing or a
//   regex match. Coalescing into one function keeps the API surface tiny;
//   the caller passes whatever signals it has and we ignore the rest.
//
// CACHING
//   The active pattern set is small (think tens to low-thousands) and almost
//   never changes inside a request lifetime. We cache it for 30 seconds in
//   a module-level map keyed by ban kind so a burst of classifications
//   shares one DB read.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY (via getSupabaseAdmin()).

import { getSupabaseAdmin } from "@/lib/supabase-server";
import { hammingHex, phash } from "./phash";

// ---------------------------------------------------------------------------
// Public types.
// ---------------------------------------------------------------------------
export type PatternKind =
  | "content_hash"
  | "ip"
  | "ip_range"
  | "fingerprint"
  | "keyword_regex"
  | "phash";

export type PatternMatch = {
  kind: PatternKind;
  value: string;       // the canonical ban-list entry that matched
  banId: string;       // pattern_bans.id
  reason: string | null;
  // Useful debug surface for the moderator UI: which signal we hit on.
  signal: "content" | "ip" | "fingerprint" | "image";
};

export type EvaluateInput = {
  content?: string;
  ip?: string;
  fingerprint?: string;
  image?: string; // image URL — fetched + phashed if a `phash` ban exists
};

// ---------------------------------------------------------------------------
// Cache layer.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 30_000;

type Row = {
  id: string;
  kind: PatternKind;
  value: string;
  reason: string | null;
};

let cache: { ts: number; rows: Row[] } | null = null;

async function loadActive(): Promise<Row[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.rows;
  const supa = getSupabaseAdmin();
  if (!supa) {
    cache = { ts: Date.now(), rows: [] };
    return [];
  }
  const nowIso = new Date().toISOString();
  const { data } = await supa
    .from("pattern_bans")
    .select("id, kind, value, reason, expires_at")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(5000);
  const rows = (data ?? []).map((r: { id: string; kind: string; value: string; reason: string | null }) => ({
    id: r.id,
    kind: r.kind as PatternKind,
    value: r.value,
    reason: r.reason,
  }));
  cache = { ts: Date.now(), rows };
  return rows;
}

// Test-only: invalidate the cache. Not exported on the index path that
// production code consumes, but available for sweep / admin tools that want
// to see a fresh ban list immediately after writing one.
export function invalidatePatternCache(): void {
  cache = null;
}

// ---------------------------------------------------------------------------
// Hashing helper — content_hash bans store a SHA-1 hex of the lowercase,
// whitespace-collapsed content. Web Crypto subtle.digest is everywhere.
// ---------------------------------------------------------------------------
async function sha1Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function canonicalText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// IP range — values are stored as CIDR-ish "1.2.3." prefixes. We do a simple
// startsWith check; full v4/v6 CIDR math is overkill for a deny list that
// admins type in by hand.
// ---------------------------------------------------------------------------
function ipRangeMatch(prefix: string, ip: string): boolean {
  return ip.startsWith(prefix);
}

// ---------------------------------------------------------------------------
// Public: evaluate.
//
// Returns the first match found; checks happen in this order so cheap signals
// short-circuit before the image fetch:
//   1. content_hash
//   2. keyword_regex
//   3. ip / ip_range
//   4. fingerprint
//   5. phash (last because it requires an HTTP fetch + DCT)
// ---------------------------------------------------------------------------
export async function evaluate(
  input: EvaluateInput
): Promise<PatternMatch | null> {
  const rows = await loadActive();
  if (rows.length === 0) return null;

  // Group by kind once so the per-signal loops are tight.
  const byKind: Record<PatternKind, Row[]> = {
    content_hash: [],
    ip: [],
    ip_range: [],
    fingerprint: [],
    keyword_regex: [],
    phash: [],
  };
  for (const r of rows) byKind[r.kind].push(r);

  // ---- 1. content_hash ----
  if (input.content && byKind.content_hash.length > 0) {
    const hash = await sha1Hex(canonicalText(input.content));
    for (const r of byKind.content_hash) {
      if (r.value === hash) {
        return {
          kind: r.kind,
          value: r.value,
          banId: r.id,
          reason: r.reason,
          signal: "content",
        };
      }
    }
  }

  // ---- 2. keyword_regex ----
  if (input.content && byKind.keyword_regex.length > 0) {
    const text = input.content; // raw, not canonicalized — regex authors decide case
    for (const r of byKind.keyword_regex) {
      try {
        const re = new RegExp(r.value, "iu");
        if (re.test(text)) {
          return {
            kind: r.kind,
            value: r.value,
            banId: r.id,
            reason: r.reason,
            signal: "content",
          };
        }
      } catch {
        // Bad regex stored — log to console, skip. Admin who created it
        // should see a warning at insert time; a stored bad regex shouldn't
        // brick the whole pipeline.
        console.warn("[patterns] invalid regex in pattern_bans", r.id, r.value);
      }
    }
  }

  // ---- 3. ip exact + ip_range ----
  if (input.ip) {
    for (const r of byKind.ip) {
      if (r.value === input.ip) {
        return {
          kind: r.kind,
          value: r.value,
          banId: r.id,
          reason: r.reason,
          signal: "ip",
        };
      }
    }
    for (const r of byKind.ip_range) {
      if (ipRangeMatch(r.value, input.ip)) {
        return {
          kind: r.kind,
          value: r.value,
          banId: r.id,
          reason: r.reason,
          signal: "ip",
        };
      }
    }
  }

  // ---- 4. fingerprint ----
  if (input.fingerprint && byKind.fingerprint.length > 0) {
    for (const r of byKind.fingerprint) {
      if (r.value === input.fingerprint) {
        return {
          kind: r.kind,
          value: r.value,
          banId: r.id,
          reason: r.reason,
          signal: "fingerprint",
        };
      }
    }
  }

  // ---- 5. phash ----
  if (input.image && byKind.phash.length > 0) {
    const hash = await phash(input.image);
    for (const r of byKind.phash) {
      // We treat any pattern within Hamming distance 6 as a match (~9% of
      // 64 bits) — tuned for compressed/resized variants of a known-bad img.
      if (hammingHex(hash, r.value) <= 6) {
        return {
          kind: r.kind,
          value: r.value,
          banId: r.id,
          reason: r.reason,
          signal: "image",
        };
      }
    }
  }

  return null;
}
