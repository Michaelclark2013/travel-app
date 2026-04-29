"use client";

// Per-user recent destinations + searches. Surfaces as chip rows on /plan,
// /flights, /hotels so the user doesn't retype the same query 5 times a session.

import { getSession } from "./auth";

export type RecentDestination = {
  label: string; // "Tokyo", "Lisbon, Portugal"
  at: number;
};

export type RecentSearch = {
  kind: "flight" | "hotel";
  label: string;
  /** Stable key — used to dedupe + restore params. */
  key: string;
  params: Record<string, string>;
  at: number;
};

const DEST_KEY = "voyage:recent-destinations";
const SEARCH_KEY = "voyage:recent-searches";
const MAX = 6;

function userKey(prefix: string): string | null {
  const u = getSession();
  return u ? `${prefix}:${u.id}` : null;
}

function load<T>(prefix: string): T[] {
  if (typeof window === "undefined") return [];
  const k = userKey(prefix);
  if (!k) return [];
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function save<T>(prefix: string, list: T[]) {
  const k = userKey(prefix);
  if (!k || typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(list.slice(0, MAX)));
}

export function loadRecentDestinations(): RecentDestination[] {
  return load<RecentDestination>(DEST_KEY);
}

export function pushRecentDestination(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return;
  const list = loadRecentDestinations().filter(
    (d) => d.label.toLowerCase() !== trimmed.toLowerCase()
  );
  list.unshift({ label: trimmed, at: Date.now() });
  save(DEST_KEY, list);
}

export function loadRecentSearches(kind?: "flight" | "hotel"): RecentSearch[] {
  const all = load<RecentSearch>(SEARCH_KEY);
  return kind ? all.filter((s) => s.kind === kind) : all;
}

export function pushRecentSearch(s: Omit<RecentSearch, "at">) {
  const list = loadRecentSearches().filter((x) => x.key !== s.key);
  list.unshift({ ...s, at: Date.now() });
  save(SEARCH_KEY, list);
}

export function clearRecents() {
  const u = getSession();
  if (!u || typeof window === "undefined") return;
  window.localStorage.removeItem(`${DEST_KEY}:${u.id}`);
  window.localStorage.removeItem(`${SEARCH_KEY}:${u.id}`);
}
