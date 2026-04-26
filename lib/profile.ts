"use client";

import { getSession } from "./auth";
import { supabase, supabaseEnabled } from "./supabase";
import { loadConfirmations, type Confirmation } from "./wallet";
import { loadTrips } from "./storage";
import type { TravelerProfile, Trip, TripPreferences } from "./types";

// =============================================================================
// Storage
// =============================================================================

const KEY = "voyage:traveler-profile";

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadProfile(): TravelerProfile {
  if (typeof window === "undefined") return {};
  const k = localKey();
  if (!k) return {};
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "{}");
  } catch {
    return {};
  }
}

export function saveProfile(p: TravelerProfile) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  const next = { ...p, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(k, JSON.stringify(next));
  if (supabaseEnabled && supabase) saveRemote(next).catch(() => {});
}

export async function loadProfileAsync(): Promise<TravelerProfile> {
  if (supabaseEnabled && supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from("profiles")
        .select("traveler_profile")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!error && data?.traveler_profile) {
        const p = data.traveler_profile as TravelerProfile;
        const k = localKey();
        if (k && typeof window !== "undefined") {
          window.localStorage.setItem(k, JSON.stringify(p));
        }
        return p;
      }
    }
  }
  return loadProfile();
}

async function saveRemote(p: TravelerProfile) {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .upsert({ user_id: user.id, traveler_profile: p }, { onConflict: "user_id" });
}

// =============================================================================
// Auto-fill new trip preferences from profile
// =============================================================================

export function applyProfileToNewTripPreferences(
  profile: TravelerProfile,
  override?: Partial<TripPreferences>
): TripPreferences {
  return {
    ...(profile.defaultPreferences ?? {}),
    ...(override ?? {}),
    updatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Smart predictions
// =============================================================================

export type DestinationHistory = {
  destination: string;
  visits: number;
  lastVisitedISO?: string;
  preferredAirlines: string[];
  preferredHotels: string[];
  totalSpend: number;
};

export function computeDestinationHistory(args: {
  trips: Trip[];
  wallet: Confirmation[];
}): DestinationHistory[] {
  const map: Record<string, DestinationHistory> = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const t of args.trips) {
    if (t.endDate > today) continue; // only count completed trips
    const key = t.destination.toLowerCase();
    const h = (map[key] ??= {
      destination: t.destination,
      visits: 0,
      preferredAirlines: [],
      preferredHotels: [],
      totalSpend: 0,
    });
    h.visits += 1;
    if (!h.lastVisitedISO || t.endDate > h.lastVisitedISO) {
      h.lastVisitedISO = t.endDate;
    }
    const tripWallet = args.wallet.filter((w) => w.tripId === t.id);
    for (const w of tripWallet) {
      h.totalSpend += w.totalUsd ?? 0;
      if (w.type === "flight" && !h.preferredAirlines.includes(w.vendor)) {
        h.preferredAirlines.push(w.vendor);
      }
      if (w.type === "hotel" && !h.preferredHotels.includes(w.vendor)) {
        h.preferredHotels.push(w.vendor);
      }
    }
  }

  return Object.values(map).sort((a, b) => b.visits - a.visits);
}

export function getDestinationSuggestions(
  destination: string
): DestinationHistory | null {
  const trips = loadTrips();
  const wallet = loadConfirmations();
  const history = computeDestinationHistory({ trips, wallet });
  return (
    history.find(
      (h) => h.destination.toLowerCase() === destination.toLowerCase()
    ) ?? null
  );
}

// =============================================================================
// Travel patterns dashboard
// =============================================================================

export type TravelPatterns = {
  totalTrips: number;
  upcomingTrips: number;
  topDestinations: { name: string; count: number }[];
  topAirlines: { name: string; count: number }[];
  topHotels: { name: string; count: number }[];
  avgTripDays: number;
  avgDailySpend: number;
  totalSpend: number;
  preferredSeason?: "spring" | "summer" | "fall" | "winter";
  monthlyDistribution: Record<string, number>;
};

const SEASONS: Record<number, "winter" | "spring" | "summer" | "fall"> = {
  0: "winter",
  1: "winter",
  2: "spring",
  3: "spring",
  4: "spring",
  5: "summer",
  6: "summer",
  7: "summer",
  8: "fall",
  9: "fall",
  10: "fall",
  11: "winter",
};

export function computeTravelPatterns(args: {
  trips: Trip[];
  wallet: Confirmation[];
}): TravelPatterns {
  const today = new Date().toISOString().slice(0, 10);
  const totalTrips = args.trips.length;
  const upcomingTrips = args.trips.filter((t) => t.startDate >= today).length;

  const dests: Record<string, number> = {};
  const airlines: Record<string, number> = {};
  const hotels: Record<string, number> = {};
  const months: Record<string, number> = {};
  const seasonCounts: Record<string, number> = {};
  let totalDays = 0;
  let totalSpend = 0;

  for (const t of args.trips) {
    dests[t.destination] = (dests[t.destination] ?? 0) + 1;
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    const days = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );
    totalDays += days;
    const m = start.toLocaleString(undefined, { month: "short" });
    months[m] = (months[m] ?? 0) + 1;
    const season = SEASONS[start.getMonth()];
    seasonCounts[season] = (seasonCounts[season] ?? 0) + 1;
  }

  for (const w of args.wallet) {
    if (w.type === "flight") {
      airlines[w.vendor] = (airlines[w.vendor] ?? 0) + 1;
    }
    if (w.type === "hotel") {
      hotels[w.vendor] = (hotels[w.vendor] ?? 0) + 1;
    }
    if (w.totalUsd) totalSpend += w.totalUsd;
  }

  const top = (m: Record<string, number>) =>
    Object.entries(m)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

  const preferredSeason = (Object.entries(seasonCounts).sort(
    ([, a], [, b]) => b - a
  )[0]?.[0] ?? undefined) as TravelPatterns["preferredSeason"];

  const avgTripDays = totalTrips > 0 ? Math.round(totalDays / totalTrips) : 0;
  const avgDailySpend =
    totalDays > 0 ? Math.round((totalSpend / totalDays) * 100) / 100 : 0;

  return {
    totalTrips,
    upcomingTrips,
    topDestinations: top(dests),
    topAirlines: top(airlines),
    topHotels: top(hotels),
    avgTripDays,
    avgDailySpend,
    totalSpend: Math.round(totalSpend * 100) / 100,
    preferredSeason,
    monthlyDistribution: months,
  };
}

// =============================================================================
// Quick rebook
// =============================================================================

export function buildRebookSeed(prevTrip: Trip): Partial<Trip> {
  return {
    destination: prevTrip.destination,
    origin: prevTrip.origin,
    travelers: prevTrip.travelers,
    budget: prevTrip.budget,
    vibes: prevTrip.vibes,
    intent: prevTrip.intent,
    transportMode: prevTrip.transportMode,
    preferences: prevTrip.preferences,
  };
}
