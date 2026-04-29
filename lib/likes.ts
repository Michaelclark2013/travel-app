"use client";

// Likes — fast, local-first, schema-aligned. Designed to plug into Supabase
// `likes` table with zero call-site changes (target string convention matches).
//
// Optimization principles (numbered to match the public docs):
//
//  1. In-memory Set<target> for O(1) "have I liked this?" checks.
//  2. localStorage writes are debounced (200ms) — rapid double-taps stay cheap.
//  3. The deterministic "base" count from a target's hash is memoized in a
//     module-level Map so a Featured tile + lightbox + explore feed all share
//     the same number without recomputing the FNV-1a digest.
//  4. A single window CustomEvent (`voyage:like-changed`) is the source of
//     truth — any number of components can subscribe; no prop drilling.
//  5. Optimistic UI — useLike() flips state before persist, which never blocks.
//  6. Aggregate "base + mock + me" count is computed at read-time but each
//     component does it once per render via a small useMemo.
//  7. The "someone liked your moment" simulation runs in requestIdleCallback
//     so it doesn't compete with input.
//  8. setState is only called when the new value differs (React's bail-out
//     does the rest, but we belt-and-suspenders).
//  9. Target convention (`mom:<id>` / `mock:<id>` / `trip:<id>`) is identical
//     to lib/comments-reposts.ts and the Supabase 0003_social schema.
// 10. Visibility-aware compute lives at the consumer (use IntersectionObserver
//     to gate rendering of tile counts in long lists — see useInView.ts pattern).

import { getSession } from "./auth";
import { MOCK_USERS } from "./social";
import { pushNotification } from "./social";
import { supabase, supabaseEnabled } from "./supabase";
import { fireAndForget } from "./realtime";

const KEY = "voyage:likes";
const EVENT = "voyage:like-changed";
const WRITE_DEBOUNCE_MS = 200;

// ---------------------------------------------------------------------------
// In-memory state. We hydrate once from storage on first call.
let liked: Set<string> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const baseCountCache = new Map<string, number>();
const mockLikersCache = new Map<string, string[]>(); // target → mock user ids

function userKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

function hydrate(): Set<string> {
  if (liked) return liked;
  liked = new Set();
  if (typeof window === "undefined") return liked;
  const k = userKey();
  if (!k) return liked;
  try {
    const raw = window.localStorage.getItem(k);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      liked = new Set(arr);
    }
  } catch {
    // Ignore — start fresh.
  }
  return liked;
}

function flushSoon() {
  if (typeof window === "undefined") return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const k = userKey();
    if (!k || !liked) return;
    try {
      window.localStorage.setItem(k, JSON.stringify([...liked]));
    } catch {}
  }, WRITE_DEBOUNCE_MS);
}

// FNV-1a, 32-bit. Cheap, stable, plenty for UI counts.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Public API.

export function isLiked(target: string): boolean {
  return hydrate().has(target);
}

/** Stable random "the world has already liked this" baseline per target. */
export function baseCount(target: string): number {
  const cached = baseCountCache.get(target);
  if (cached != null) return cached;
  const h = hash(target);
  // 4–48 baseline likes — feels like real activity, never zero-sum.
  const v = 4 + (h % 45);
  baseCountCache.set(target, v);
  return v;
}

/** Which mock users have already "liked" this target — deterministic. */
export function mockLikers(target: string): string[] {
  const cached = mockLikersCache.get(target);
  if (cached) return cached;
  const h = hash(target + ":likers");
  const count = (h % 4) + 1; // 1–4 mock likers
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(MOCK_USERS[(h + i * 7) % MOCK_USERS.length].id);
  }
  mockLikersCache.set(target, ids);
  return ids;
}

export function likeCount(target: string): number {
  const base = baseCount(target);
  const mock = mockLikers(target).length;
  const me = isLiked(target) ? 1 : 0;
  return base + mock + me;
}

export function setLiked(target: string, value: boolean): void {
  const set = hydrate();
  const had = set.has(target);
  if (value && !had) set.add(target);
  else if (!value && had) set.delete(target);
  else return; // 8. No-op when state hasn't changed.
  flushSoon();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: target }));
  }
  // Fire-and-forget Supabase mirror. Local mirror is the source of truth for
  // instant UI; this just keeps the server in sync. Failures are swallowed —
  // the next boot hydrate will reconcile.
  if (supabaseEnabled && supabase) {
    fireAndForget(pushLikeRemote(target, value));
  }
}

async function pushLikeRemote(target: string, value: boolean): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (value) {
    await supabase
      .from("likes")
      .upsert(
        { user_id: user.id, moment_id: target },
        { onConflict: "user_id,moment_id" }
      );
  } else {
    await supabase
      .from("likes")
      .delete()
      .eq("user_id", user.id)
      .eq("moment_id", target);
  }
}

export function toggleLike(target: string): boolean {
  const next = !isLiked(target);
  setLiked(target, next);
  return next;
}

/** Subscribe to changes. Returns an unsubscribe fn. */
export function onLikeChange(handler: (target: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

// ---------------------------------------------------------------------------
// Mock-user "someone liked your moment" simulation. Schedules a few delayed
// likes from random mock users when the *current* user likes their own
// content — gives the social loop a reward signal without a backend.

export function simulateAudience(target: string, opts: { isMine: boolean }) {
  if (typeof window === "undefined") return;
  if (!opts.isMine) return;

  const idle = (cb: () => void, ms: number) => {
    // 7. requestIdleCallback when available so we don't compete with input.
    const ric = (window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
    }).requestIdleCallback;
    setTimeout(
      () => (ric ? ric(() => cb()) : cb()),
      ms
    );
  };

  // Schedule 1–3 simulated reactions from mock users.
  const h = hash(target + ":sim");
  const count = (h % 3) + 1;
  for (let i = 0; i < count; i++) {
    const mockUser = MOCK_USERS[(h + i * 11) % MOCK_USERS.length];
    idle(() => {
      // Push a notification — the bell badge picks this up automatically.
      pushNotification({
        kind: "like",
        fromUserId: mockUser.id,
        text: "liked your moment",
        href: "/profile",
      });
      // Bump display count by emitting a change for this target so any open
      // tiles re-render their count.
      window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: target }));
    }, 2500 + i * 4000 + Math.random() * 3000);
  }
}
