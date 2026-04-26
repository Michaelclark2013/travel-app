"use client";

import { getSession } from "./auth";
import { loadTrips } from "./storage";
import { supabase, supabaseEnabled } from "./supabase";
import {
  parseEmailRaw,
  toUsd,
  currencySymbol,
  type ConfirmationType,
  type ParsedConfirmation,
} from "./wallet-rules";

export type { ConfirmationType } from "./wallet-rules";

export type Confirmation = {
  id: string;
  tripId?: string;
  type: ConfirmationType;
  title: string;
  vendor: string;
  reference: string;
  /** Primary date (YYYY-MM-DD). For multi-day stays this is the start. */
  date: string;
  /** End date for stays / cruises (YYYY-MM-DD). */
  endDate?: string;
  time?: string;
  /** Origin city/airport for flights, train, etc. */
  from?: string;
  /** Destination for flights, train, etc. */
  to?: string;
  detail: string;
  totalUsd?: number;
  /** Original currency total — preserved for non-USD bookings. */
  totalOriginal?: number;
  /** ISO 4217 code for the original currency. */
  currency?: string;
  source: "auto-import" | "manual" | "ingest";
  createdAt?: string;
};

// ============================================================================
// Local storage (offline-first, mirror to Supabase when authed)
// ============================================================================

const KEY = "voyage:wallet";

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

function loadLocal(): Confirmation[] {
  if (typeof window === "undefined") return [];
  const k = localKey();
  if (!k) return [];
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "[]");
  } catch {
    return [];
  }
}

function saveLocal(items: Confirmation[]) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(items));
}

export function loadConfirmations(): Confirmation[] {
  return loadLocal();
}

export function saveConfirmations(items: Confirmation[]) {
  saveLocal(items);
}

export function addConfirmation(c: Confirmation) {
  const items = loadLocal();
  items.unshift(c);
  saveLocal(items);
  if (supabaseEnabled && supabase) {
    upsertRemote(c).catch(() => {});
  }
}

export function updateConfirmation(id: string, patch: Partial<Confirmation>) {
  const items = loadLocal();
  const idx = items.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const next = { ...items[idx], ...patch, id };
  // Recompute totalUsd if the user edited the original amount or currency.
  if (
    patch.totalOriginal !== undefined ||
    patch.currency !== undefined
  ) {
    if (next.totalOriginal != null && next.currency) {
      next.totalUsd = toUsd(next.totalOriginal, next.currency);
    }
  }
  items[idx] = next;
  saveLocal(items);
  if (supabaseEnabled && supabase) {
    upsertRemote(next).catch(() => {});
  }
  return next;
}

export function deleteConfirmation(id: string) {
  saveLocal(loadLocal().filter((c) => c.id !== id));
  if (supabaseEnabled && supabase) {
    supabase.from("wallet_items").delete().eq("id", id).then(() => {});
  }
}

// ----- Async / Supabase-aware -----

export async function loadConfirmationsAsync(): Promise<Confirmation[]> {
  if (supabaseEnabled && supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from("wallet_items")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: true });
      if (!error && data) {
        const items = data.map(rowToConfirmation);
        saveLocal(items);
        return items;
      }
    }
  }
  return loadLocal();
}

async function upsertRemote(c: Confirmation) {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("wallet_items").upsert(confirmationToRow(c, user.id));
}

type WalletRow = {
  id: string;
  user_id: string;
  trip_id: string | null;
  type: string;
  title: string;
  vendor: string;
  reference: string;
  date: string;
  end_date: string | null;
  time: string | null;
  detail: string | null;
  from_loc: string | null;
  to_loc: string | null;
  total_usd: number | null;
  total_original: number | null;
  currency: string | null;
  source: string;
  created_at: string;
};

function confirmationToRow(c: Confirmation, userId: string): WalletRow {
  return {
    id: c.id,
    user_id: userId,
    trip_id: c.tripId ?? null,
    type: c.type,
    title: c.title,
    vendor: c.vendor,
    reference: c.reference,
    date: c.date,
    end_date: c.endDate ?? null,
    time: c.time ?? null,
    detail: c.detail ?? null,
    from_loc: c.from ?? null,
    to_loc: c.to ?? null,
    total_usd: c.totalUsd ?? null,
    total_original: c.totalOriginal ?? null,
    currency: c.currency ?? null,
    source: c.source,
    created_at: c.createdAt ?? new Date().toISOString(),
  };
}

function rowToConfirmation(r: WalletRow): Confirmation {
  return {
    id: r.id,
    tripId: r.trip_id ?? undefined,
    type: r.type as ConfirmationType,
    title: r.title,
    vendor: r.vendor,
    reference: r.reference,
    date: r.date,
    endDate: r.end_date ?? undefined,
    time: r.time ?? undefined,
    from: r.from_loc ?? undefined,
    to: r.to_loc ?? undefined,
    detail: r.detail ?? "",
    totalUsd: r.total_usd ?? undefined,
    totalOriginal: r.total_original ?? undefined,
    currency: r.currency ?? undefined,
    source: r.source as Confirmation["source"],
    createdAt: r.created_at,
  };
}

// ============================================================================
// Currency
// ============================================================================

export function formatMoney(amount: number, currency = "USD"): string {
  const sym = currencySymbol(currency);
  const rounded =
    currency === "JPY" || currency === "KRW"
      ? Math.round(amount).toLocaleString()
      : amount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return sym ? `${sym}${rounded}` : `${rounded} ${currency}`;
}

export { toUsd };

// ============================================================================
// Email parser — wraps the pure parser with trip association.
// ============================================================================

export function parseEmail(raw: string): Confirmation | null {
  const parsed = parseEmailRaw(raw);
  if (!parsed) return null;
  const trips = loadTrips();
  const trip = trips.find((t) => parsed.date >= t.startDate && parsed.date <= t.endDate);
  return adoptParsed(parsed, trip?.id);
}

export function adoptParsed(p: ParsedConfirmation, tripId?: string): Confirmation {
  return { ...p, tripId };
}

// ============================================================================
// Spending dashboard helpers
// ============================================================================

export type CategoryTotal = {
  type: ConfirmationType;
  count: number;
  totalUsd: number;
};

export function summarize(items: Confirmation[]): {
  totalUsd: number;
  byType: CategoryTotal[];
  byCurrency: { currency: string; totalOriginal: number; totalUsd: number }[];
} {
  const byTypeMap: Record<string, CategoryTotal> = {};
  const byCurMap: Record<string, { totalOriginal: number; totalUsd: number }> = {};
  let total = 0;
  for (const c of items) {
    const t = (byTypeMap[c.type] ??= { type: c.type, count: 0, totalUsd: 0 });
    t.count += 1;
    if (c.totalUsd != null) {
      t.totalUsd += c.totalUsd;
      total += c.totalUsd;
    }
    const cur = c.currency ?? (c.totalUsd != null ? "USD" : null);
    if (cur && c.totalOriginal != null) {
      const b = (byCurMap[cur] ??= { totalOriginal: 0, totalUsd: 0 });
      b.totalOriginal += c.totalOriginal;
      b.totalUsd += c.totalUsd ?? 0;
    } else if (cur === "USD" && c.totalUsd != null) {
      const b = (byCurMap.USD ??= { totalOriginal: 0, totalUsd: 0 });
      b.totalOriginal += c.totalUsd;
      b.totalUsd += c.totalUsd;
    }
  }
  return {
    totalUsd: Math.round(total * 100) / 100,
    byType: Object.values(byTypeMap).sort((a, b) => b.totalUsd - a.totalUsd),
    byCurrency: Object.entries(byCurMap).map(([currency, v]) => ({ currency, ...v })),
  };
}
