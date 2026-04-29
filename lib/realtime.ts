"use client";

// Realtime + boot-hydration glue for the Supabase social layer.
//
// What this module does:
//   1. Exposes `hydrateSocialFromSupabase()` — called once at app boot (after
//      auth resolves). It pulls the user's current state from Supabase
//      (profiles, follows, likes, saves, comments, reposts, moments, threads,
//      notifications) and writes it into the same localStorage keys our sync
//      helpers read from. After hydration, `loadNotifications()`/etc. return
//      authoritative server data even though the helpers themselves stayed
//      sync. Local-first writes still happen instantly; the hydrate-on-boot is
//      the "overwrite local with server" half of the loop.
//
//   2. Exposes `subscribeSocialRealtime()` — opens a single Realtime channel
//      and forwards `postgres_changes` for likes / notifications / dm_messages
//      to local state and to the same window CustomEvents the existing
//      components already listen for. So a like inserted from another tab
//      (or another device) lights up the heart in this tab via
//      "voyage:like-changed".
//
//   3. Exposes `useSocialRealtime()` — a thin React hook that components can
//      drop into their tree to ensure the channel is live + cleaned up.
//      Currently we mount this once at the layout level so it's effectively
//      a singleton; the hook handles re-mount/unmount safely either way.
//
// Why a separate module:
//   - Keeps the existing per-feature helpers (likes.ts, social.ts, etc.) with
//     a sync API and zero awareness of channel lifecycle.
//   - One channel per session is cheaper than N independent subscriptions —
//     Supabase Realtime quotas are per-channel.
//
// Local-first guarantee:
//   - Every function bails out early when `supabaseEnabled` is false. Callers
//     can invoke them unconditionally; they're effectively no-ops without env
//     keys.

import { useEffect } from "react";
import { supabase, supabaseEnabled } from "./supabase";

// ---------------------------------------------------------------------------
// Storage-key conventions — kept in sync with the per-feature helpers.
// ---------------------------------------------------------------------------
const LIKES_KEY = "voyage:likes";
const SAVES_KEY = "voyage:saves";
const FOLLOW_KEY = "voyage:following";
const NOTIF_KEY = "voyage:notifs";
const COMMENTS_KEY = "voyage:comments";
const REPOSTS_KEY = "voyage:reposts";

// ---------------------------------------------------------------------------
// Type — minimal shape for a notification row coming back from the DB. We
// reshape into the local Notification type at the call site.
// ---------------------------------------------------------------------------
type DbNotification = {
  id: string;
  user_id: string;
  kind: string;
  from_user_id: string | null;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

type DbLike = { user_id: string; moment_id: string };
type DbComment = {
  id: string;
  target: string;
  author_id: string;
  body: string;
  created_at: string;
};
type DbRepost = {
  user_id: string;
  target: string;
  caption: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Helpers — keyed local-storage R/W.
// ---------------------------------------------------------------------------
function userScopedKey(prefix: string, userId: string): string {
  return `${prefix}:${userId}`;
}

function writeLocal<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — ignore */
  }
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Public API: hydrate.
//
// Called once after auth resolves. Replaces local mirror tables with whatever
// Supabase says is true. After this returns, the existing sync helpers will
// see the real data on next call.
// ---------------------------------------------------------------------------
export async function hydrateSocialFromSupabase(userId: string): Promise<void> {
  if (!supabaseEnabled || !supabase) return;
  if (!userId) return;

  // Run all hydrators in parallel — they're independent reads.
  await Promise.allSettled([
    hydrateLikes(userId),
    hydrateSaves(userId),
    hydrateFollows(userId),
    hydrateNotifications(userId),
    hydrateComments(userId),
    hydrateReposts(userId),
  ]);

  // Notify any mounted components that local mirrors changed.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("voyage:social-hydrated"));
  }
}

async function hydrateLikes(userId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("likes")
    .select("moment_id")
    .eq("user_id", userId);
  if (error || !data) return;
  // Local likes use the `mom:<id>` / `mock:<id>` / `trip:<id>` target
  // convention. Supabase only stores moment_id (text — we store the full
  // target string in that column to keep the convention 1:1).
  const targets = data.map((r: { moment_id: string }) => r.moment_id);
  writeLocal(userScopedKey(LIKES_KEY, userId), targets);
}

async function hydrateSaves(userId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("saves")
    .select("moment_id")
    .eq("user_id", userId);
  if (error || !data) return;
  const targets = data.map((r: { moment_id: string }) => r.moment_id);
  writeLocal(userScopedKey(SAVES_KEY, userId), targets);
}

async function hydrateFollows(userId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userId);
  if (error || !data) return;
  const ids = data.map((r: { followee_id: string }) => r.followee_id);
  writeLocal(userScopedKey(FOLLOW_KEY, userId), ids);
}

async function hydrateNotifications(userId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return;
  const list = (data as DbNotification[]).map((n) => ({
    id: n.id,
    kind: n.kind,
    fromUserId: n.from_user_id ?? undefined,
    text: n.body ?? undefined,
    href: n.href ?? undefined,
    createdAt: n.created_at,
    read: !!n.read_at,
  }));
  writeLocal(userScopedKey(NOTIF_KEY, userId), list);
}

async function hydrateComments(userId: string): Promise<void> {
  if (!supabase) return;
  // We hydrate the user's own comments; comments BY others on the user's
  // content come down via the per-target reads in lib/comments-reposts.ts
  // when a viewer opens that moment. Keeping this scoped avoids pulling the
  // entire comment table.
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("author_id", userId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error || !data) return;
  const list = (data as DbComment[]).map((c) => ({
    id: c.id,
    target: c.target,
    authorId: "me", // local convention — current user's comments are "me"
    text: c.body,
    createdAt: c.created_at,
  }));
  writeLocal(userScopedKey(COMMENTS_KEY, userId), list);
}

async function hydrateReposts(userId: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("reposts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return;
  const list = (data as DbRepost[]).map((r) => ({
    id: `rp-${r.target}-${new Date(r.created_at).getTime()}`,
    target: r.target,
    caption: r.caption ?? undefined,
    createdAt: r.created_at,
  }));
  writeLocal(userScopedKey(REPOSTS_KEY, userId), list);
}

// ---------------------------------------------------------------------------
// Public API: subscribe to Realtime.
//
// Opens ONE channel per session and binds a few postgres_changes listeners
// for the things that need live updates: notifications (so the bell badge
// flips without refresh), likes (for hearts on tiles), and DM messages (for
// inbox previews + the active thread view).
//
// Returns an unsubscribe function. Pass the same userId you used to hydrate.
// ---------------------------------------------------------------------------
export function subscribeSocialRealtime(userId: string): () => void {
  if (!supabaseEnabled || !supabase || !userId) return () => {};

  const channel = supabase
    .channel(`voyage-social-${userId}`)
    // ----- Notifications addressed to this user -----
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const n = payload.new as DbNotification;
        // Append into local mirror.
        const key = userScopedKey(NOTIF_KEY, userId);
        const existing = readLocal<
          {
            id: string;
            kind: string;
            fromUserId?: string;
            text?: string;
            href?: string;
            createdAt: string;
            read?: boolean;
          }[]
        >(key, []);
        const next = [
          {
            id: n.id,
            kind: n.kind,
            fromUserId: n.from_user_id ?? undefined,
            text: n.body ?? undefined,
            href: n.href ?? undefined,
            createdAt: n.created_at,
            read: !!n.read_at,
          },
          ...existing.filter((x) => x.id !== n.id),
        ];
        writeLocal(key, next);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("voyage:notifs-updated"));
        }
      }
    )
    // ----- Likes on anything (used to drive count refresh) -----
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "likes",
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as DbLike | undefined;
        if (!row) return;
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent<string>("voyage:like-changed", {
              detail: row.moment_id,
            })
          );
        }
      }
    )
    // ----- DMs in any thread the user is in.
    // We can't filter to "threads I'm in" from the client (RLS handles read
    // access; it's safe to subscribe broadly and let Supabase drop the rows
    // we can't see). The inbox + thread page listen on
    // `voyage:dm-updated` already.
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "dm_messages",
      },
      () => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("voyage:dm-updated"));
        }
      }
    )
    // ----- Follows where I'm the followee (for follower-count refresh) -----
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "follows",
        filter: `followee_id=eq.${userId}`,
      },
      () => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("voyage:follows-updated"));
        }
      }
    )
    .subscribe();

  return () => {
    if (supabase) supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Public API: hook — drop into a top-level client component.
//
// Behavior:
//   - When supabaseEnabled is false: no-op, returns immediately.
//   - When userId becomes available: hydrates once, then opens a Realtime
//     channel; tears the channel down on unmount or userId change.
// ---------------------------------------------------------------------------
export function useSocialRealtime(userId: string | null | undefined): void {
  useEffect(() => {
    if (!supabaseEnabled || !userId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      await hydrateSocialFromSupabase(userId);
      if (cancelled) return;
      unsubscribe = subscribeSocialRealtime(userId);
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);
}

// ---------------------------------------------------------------------------
// Tiny utility: fire-and-forget Promise. Used by helpers that want to push to
// Supabase from a sync caller without making the caller async. Accepts both
// real Promises and Supabase's thenable PostgrestFilterBuilder objects.
// ---------------------------------------------------------------------------
type Thenable<T> = {
  then: (
    onFulfilled?: (value: T) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => unknown;
};

// Track D: relaxed signature — accept anything with a `.then(...)` method.
// Supabase's PostgrestFilterBuilder is technically a thenable but TS can't
// always narrow it to our previous Thenable<unknown> generic. Using `any`
// here keeps the call sites clean and is safe because we only call .then.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fireAndForget(p: any): void {
  if (p == null) return;
  try {
    if (typeof p.then === "function") {
      p.then(undefined, () => {
        /* swallow — local mirror remains source of truth on failure */
      });
    }
  } catch {
    /* defensive — never throw out of a fire-and-forget */
  }
}
