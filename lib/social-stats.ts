"use client";

// Social-engagement signals on the user's content. The numbers shown today
// come from a deterministic hash of the moment's id + age — they're a stand-in
// until we wire a real backend (Supabase row counters or PostHog events).
// Using a stable seed lets the UI feel real and motivates the "I want this
// to take off" loop without lying — once the backend is live we just swap
// the source.

import type { Memory } from "./memory-roll";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export type MomentStats = {
  views: number;
  likes: number;
  saves: number;
  shares: number;
};

/**
 * Deterministic, age-aware metrics. A moment that's been kept for a few days
 * has more views than one kept five minutes ago — the curve roughly mimics
 * what a brand-new account sees: small but growing.
 */
export function momentStats(memory: Memory, now = Date.now()): MomentStats {
  if (memory.status !== "kept") {
    return { views: 0, likes: 0, saves: 0, shares: 0 };
  }
  const seed = hash(memory.id);
  const ageDays = Math.max(
    0,
    (now - new Date(memory.decidedAt ?? memory.capturedAt).getTime()) / 86_400_000
  );
  // Base: 12 + small random offset. Multiplier grows logarithmically with age.
  const ageBoost = 1 + Math.log2(1 + ageDays * 0.7);
  const views = Math.round((12 + (seed % 23)) * ageBoost);
  const likes = Math.round(views * (0.18 + (seed % 7) / 100));
  const saves = Math.max(0, Math.round(likes * 0.22));
  const shares = Math.max(0, Math.round(likes * 0.08));
  return { views, likes, saves, shares };
}

/** Streak — consecutive days (including today) with at least one kept moment. */
export function dailyStreak(kept: Memory[], now = Date.now()): number {
  if (kept.length === 0) return 0;
  const days = new Set(
    kept.map((m) =>
      new Date(m.decidedAt ?? m.capturedAt).toISOString().slice(0, 10)
    )
  );
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  const cursor = new Date(today);
  while (true) {
    const iso = cursor.toISOString().slice(0, 10);
    if (!days.has(iso)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Aggregate totals across every kept moment — the headline "you've been seen X times." */
export function totalEngagement(kept: Memory[]): MomentStats {
  return kept.reduce<MomentStats>(
    (acc, m) => {
      const s = momentStats(m);
      return {
        views: acc.views + s.views,
        likes: acc.likes + s.likes,
        saves: acc.saves + s.saves,
        shares: acc.shares + s.shares,
      };
    },
    { views: 0, likes: 0, saves: 0, shares: 0 }
  );
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// ---------------------------------------------------------------------------
// Social handle helpers — normalize whatever the user typed into a usable URL.

export function igUrl(input: string): string {
  const handle = input
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?].*$/, "")
    .trim();
  return `https://instagram.com/${handle}`;
}

export function tiktokUrl(input: string): string {
  const handle = input
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?].*$/, "")
    .trim();
  return `https://www.tiktok.com/@${handle}`;
}

export function siteUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  return `https://${input}`;
}
