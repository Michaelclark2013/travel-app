"use client";

import { getSession } from "./auth";
import { supabase, supabaseEnabled } from "./supabase";

export type Friend = {
  id: string;
  email: string;
  name?: string;
  status: "pending" | "accepted";
  invitedAt: string;
};

const KEY = "voyage:friends";

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadFriends(): Friend[] {
  if (typeof window === "undefined") return [];
  const k = localKey();
  if (!k) return [];
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "[]");
  } catch {
    return [];
  }
}

export function saveFriends(friends: Friend[]) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(friends));
}

export function inviteFriend(email: string, name?: string): Friend {
  const friend: Friend = {
    id: `frd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: email.trim().toLowerCase(),
    name: name?.trim(),
    status: "pending",
    invitedAt: new Date().toISOString(),
  };
  const next = [...loadFriends(), friend];
  saveFriends(next);
  if (supabaseEnabled && supabase) {
    inviteRemote(friend).catch(() => {});
  }
  return friend;
}

async function inviteRemote(f: Friend) {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("friendships").insert({
    id: f.id,
    from_user: user.id,
    to_email: f.email,
    status: "pending",
  });
}

// Friend-graph signals — for "Sarah was just in Lisbon" cards. Demo data so the
// UI is meaningful without a populated database.
export type FriendSignal = {
  friendName: string;
  destination: string;
  rating: number;
  note?: string;
  visitedAt: string;
};

const DEMO_SIGNALS: FriendSignal[] = [
  {
    friendName: "Sarah",
    destination: "Lisbon",
    rating: 5,
    note: "Time Out market is overhyped — go to Mercado de Campo de Ourique instead.",
    visitedAt: "2026-03-12",
  },
  {
    friendName: "Diego",
    destination: "Tokyo",
    rating: 5,
    note: "Stay in Yanaka, not Shinjuku. Quieter and feels real.",
    visitedAt: "2026-02-04",
  },
  {
    friendName: "Hiro",
    destination: "Mexico City",
    rating: 4,
    note: "Eat at Pujol if you can get a ressy 8 weeks out.",
    visitedAt: "2026-01-22",
  },
  {
    friendName: "Maya",
    destination: "Marrakech",
    rating: 5,
    note: "Hire a guide for the souks the first day — it pays off.",
    visitedAt: "2025-11-30",
  },
];

export function signalsFor(destination: string): FriendSignal[] {
  return DEMO_SIGNALS.filter(
    (s) => s.destination.toLowerCase() === destination.toLowerCase()
  );
}
