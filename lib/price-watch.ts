"use client";

import { getSession } from "./auth";
import type { Confirmation } from "./wallet";
import type { PricePoint, PriceWatch } from "./types";

const KEY = "voyage:price-watch";

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadAllWatches(): Record<string, PriceWatch> {
  if (typeof window === "undefined") return {};
  const k = localKey();
  if (!k) return {};
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "{}");
  } catch {
    return {};
  }
}

export function loadWatch(confirmationId: string): PriceWatch | null {
  return loadAllWatches()[confirmationId] ?? null;
}

export function setWatch(watch: PriceWatch) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  const all = loadAllWatches();
  all[watch.confirmationId] = watch;
  window.localStorage.setItem(k, JSON.stringify(all));
}

export function toggleWatch(c: Confirmation, enabled: boolean): PriceWatch {
  const existing = loadWatch(c.id);
  const seedHistory: PricePoint[] = existing?.history?.length
    ? existing.history
    : seedPriceHistory(c);
  const next: PriceWatch = {
    confirmationId: c.id,
    enabled,
    history: seedHistory,
    alertBelowUsd: existing?.alertBelowUsd,
  };
  setWatch(next);
  return next;
}

// Mock 14 days of price wobble — deterministic-by-id.
function seedPriceHistory(c: Confirmation): PricePoint[] {
  const base = c.totalUsd ?? 0;
  if (base <= 0) return [];
  const seedNum = hash(c.id);
  const points: PricePoint[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const swing = Math.sin((seedNum + i) / 2) * 0.12 + ((seedNum + i) % 11) / 200;
    const price = Math.round(base * (1 + swing) * 100) / 100;
    points.push({ dateISO: date.toISOString().slice(0, 10), price });
  }
  return points;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Given a price history, return the lowest-seen price + the % change vs the
// most recent point.
export function summarizeWatch(history: PricePoint[]): {
  current: number;
  low: number;
  high: number;
  changePct: number;
} {
  if (history.length === 0) {
    return { current: 0, low: 0, high: 0, changePct: 0 };
  }
  const last = history[history.length - 1].price;
  const first = history[0].price;
  const low = Math.min(...history.map((h) => h.price));
  const high = Math.max(...history.map((h) => h.price));
  const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
  return { current: last, low, high, changePct };
}
