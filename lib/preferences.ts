"use client";

import { getSession } from "./auth";
import { loadTrips } from "./storage";
import type { Trip } from "./types";

export type TravelPersona = {
  topVibes: { vibe: string; count: number }[];
  topIntents: { intent: string; count: number }[];
  preferredMode: "walk" | "transit" | "drive" | null;
  withKidsPct: number;
  accessibilityPct: number;
  carbonAwarePct: number;
  avgTripDays: number;
  avgTravelers: number;
  totalTrips: number;
  totalActivities: number;
  totalDistanceMiles: number;
};

export function buildPersona(): TravelPersona {
  const trips = loadTrips();
  return summarize(trips);
}

function summarize(trips: Trip[]): TravelPersona {
  const empty: TravelPersona = {
    topVibes: [],
    topIntents: [],
    preferredMode: null,
    withKidsPct: 0,
    accessibilityPct: 0,
    carbonAwarePct: 0,
    avgTripDays: 0,
    avgTravelers: 0,
    totalTrips: 0,
    totalActivities: 0,
    totalDistanceMiles: 0,
  };
  if (trips.length === 0) return empty;

  const vibeCounts: Record<string, number> = {};
  const intentCounts: Record<string, number> = {};
  const modeCounts: Record<string, number> = {};
  let withKids = 0;
  let accessibility = 0;
  let carbonAware = 0;
  let totalDays = 0;
  let totalTravelers = 0;
  let totalActivities = 0;

  for (const t of trips) {
    for (const v of t.vibes) vibeCounts[v] = (vibeCounts[v] ?? 0) + 1;
    if (t.intent) intentCounts[t.intent] = (intentCounts[t.intent] ?? 0) + 1;
    modeCounts[t.transportMode] = (modeCounts[t.transportMode] ?? 0) + 1;
    if (t.withKids) withKids++;
    if (t.accessibility) accessibility++;
    if (t.carbonAware) carbonAware++;
    totalDays += t.itinerary.length;
    totalTravelers += t.travelers;
    totalActivities += t.itinerary.reduce((s, d) => s + d.items.length, 0);
  }

  const sortByCount = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([k, c]) => [k, c] as const)
      .sort((a, b) => b[1] - a[1]);

  const preferredMode = sortByCount(modeCounts)[0]?.[0] as
    | TravelPersona["preferredMode"]
    | undefined;

  return {
    topVibes: sortByCount(vibeCounts)
      .slice(0, 5)
      .map(([vibe, count]) => ({ vibe, count })),
    topIntents: sortByCount(intentCounts)
      .slice(0, 3)
      .map(([intent, count]) => ({ intent, count })),
    preferredMode: preferredMode ?? null,
    withKidsPct: Math.round((withKids / trips.length) * 100),
    accessibilityPct: Math.round((accessibility / trips.length) * 100),
    carbonAwarePct: Math.round((carbonAware / trips.length) * 100),
    avgTripDays: Math.round(totalDays / trips.length),
    avgTravelers: Math.round(totalTravelers / trips.length),
    totalTrips: trips.length,
    totalActivities,
    totalDistanceMiles: 0,
  };
}

const PROFILE_KEY = "voyage:profile";

export type SavedPreferences = {
  preferAisle: boolean;
  avoidRedeyes: boolean;
  walkPace: "slow" | "normal" | "fast";
  diet: string;
};

export function loadPreferences(): SavedPreferences {
  if (typeof window === "undefined") {
    return { preferAisle: false, avoidRedeyes: false, walkPace: "normal", diet: "" };
  }
  const u = getSession();
  if (!u) {
    return { preferAisle: false, avoidRedeyes: false, walkPace: "normal", diet: "" };
  }
  try {
    const raw = window.localStorage.getItem(`${PROFILE_KEY}:${u.id}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { preferAisle: false, avoidRedeyes: false, walkPace: "normal", diet: "" };
}

export function savePreferences(p: SavedPreferences) {
  const u = getSession();
  if (!u || typeof window === "undefined") return;
  window.localStorage.setItem(`${PROFILE_KEY}:${u.id}`, JSON.stringify(p));
}
