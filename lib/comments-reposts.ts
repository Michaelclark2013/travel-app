"use client";

// Comments + reposts. Local-first; the storage shape mirrors what
// supabase/migrations/0003_social.sql defines, so flipping the backend on
// only requires swapping `read*` / `write*` to call the table.

import { getSession } from "./auth";
import { MOCK_USERS } from "./social";
import { supabase, supabaseEnabled } from "./supabase";
import { fireAndForget } from "./realtime";

// ---------------------------------------------------------------------------
// Comments

export type Comment = {
  id: string;
  /** What this comment is on. Use a synthetic key like:
   *    `mom:<momentId>`  — a Memory the user kept
   *    `mock:<mockMomentId>` — a mock user's seeded moment
   *    `trip:<tripId>` — a saved trip
   */
  target: string;
  /** Author. "me" for the current user, or a mock user id (e.g. "u-mira"). */
  authorId: string;
  text: string;
  createdAt: string;
};

const COMMENTS_KEY = "voyage:comments";

function userKey(prefix: string): string | null {
  const u = getSession();
  return u ? `${prefix}:${u.id}` : null;
}
function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadComments(target: string): Comment[] {
  const k = userKey(COMMENTS_KEY);
  if (!k) return [];
  const all = read<Comment[]>(k, []);
  return all
    .filter((c) => c.target === target)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addComment(target: string, text: string): Comment {
  const k = userKey(COMMENTS_KEY);
  const trimmed = text.trim();
  const c: Comment = {
    id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    target,
    authorId: "me",
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  if (!k) return c;
  const all = read<Comment[]>(k, []);
  write(k, [...all, c]);
  // Background-sync to Supabase. Local mirror is authoritative for the
  // optimistic UI; the server insert is fire-and-forget.
  if (supabaseEnabled && supabase) {
    fireAndForget(pushCommentRemote(c));
  }
  // Schedule a friendly-feeling reply ~70% of the time so the demo feels alive.
  if (Math.random() < 0.7) {
    const responder = MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];
    const replies = [
      "🔥",
      "saving this",
      "wait — when?",
      "love this corner",
      "going next month",
      "📍📍📍",
    ];
    window.setTimeout(() => {
      const all2 = read<Comment[]>(k, []);
      const reply: Comment = {
        id: `cm-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
        target,
        authorId: responder.id,
        text: replies[Math.floor(Math.random() * replies.length)],
        createdAt: new Date().toISOString(),
      };
      write(k, [...all2, reply]);
      window.dispatchEvent(new CustomEvent("voyage:comments-updated", { detail: target }));
    }, 1500 + Math.random() * 2500);
  }
  return c;
}

export function deleteComment(id: string): void {
  const k = userKey(COMMENTS_KEY);
  if (!k) return;
  const all = read<Comment[]>(k, []);
  write(
    k,
    all.filter((c) => c.id !== id)
  );
  if (supabaseEnabled && supabase) {
    fireAndForget(supabase.from("comments").delete().eq("id", id));
  }
}

async function pushCommentRemote(c: Comment): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("comments").insert({
    id: c.id,
    target: c.target,
    author_id: user.id,
    body: c.text,
    created_at: c.createdAt,
  });
}

export function commentCount(target: string): number {
  const k = userKey(COMMENTS_KEY);
  if (!k) return 0;
  return read<Comment[]>(k, []).filter((c) => c.target === target).length;
}

// ---------------------------------------------------------------------------
// Reposts — "I want this on my feed too." Each entry says: at time T, user
// reposted `target` with optional caption.

export type Repost = {
  id: string;
  target: string;
  caption?: string;
  createdAt: string;
};

const REPOSTS_KEY = "voyage:reposts";

export function loadReposts(): Repost[] {
  const k = userKey(REPOSTS_KEY);
  if (!k) return [];
  return read<Repost[]>(k, []);
}

export function isReposted(target: string): boolean {
  return loadReposts().some((r) => r.target === target);
}

export function repost(target: string, caption?: string): Repost {
  const k = userKey(REPOSTS_KEY);
  const r: Repost = {
    id: `rp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    target,
    caption: caption?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  if (!k) return r;
  const all = loadReposts();
  if (!all.some((x) => x.target === target)) {
    write(k, [r, ...all]);
  }
  if (supabaseEnabled && supabase) {
    fireAndForget(pushRepostRemote(target, r.caption));
  }
  return r;
}

export function unrepost(target: string): void {
  const k = userKey(REPOSTS_KEY);
  if (!k) return;
  write(
    k,
    loadReposts().filter((r) => r.target !== target)
  );
  if (supabaseEnabled && supabase) {
    fireAndForget(unrepostRemote(target));
  }
}

async function pushRepostRemote(target: string, caption?: string): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("reposts")
    .upsert(
      { user_id: user.id, target, caption: caption ?? null },
      { onConflict: "user_id,target" }
    );
}

async function unrepostRemote(target: string): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("reposts")
    .delete()
    .eq("user_id", user.id)
    .eq("target", target);
}

export function repostCount(target: string): number {
  // Stub: deterministic ~0–4 plus 1 if current user reposted.
  let h = 2166136261;
  for (let i = 0; i < target.length; i++) {
    h ^= target.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const base = Math.abs(h) % 5;
  return base + (isReposted(target) ? 1 : 0);
}
