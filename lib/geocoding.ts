"use client";

import { getSession } from "./auth";
import { loadProfile } from "./profile";

export type LocationData = {
  id: string;
  name: string;
  fullName: string;
  kind: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  lat: number;
  lng: number;
  iata?: string;
};

const RECENT_KEY = "voyage:recent-locations";
const RECENT_LIMIT = 8;

function recentKey(): string | null {
  const u = getSession();
  return u ? `${RECENT_KEY}:${u.id}` : null;
}

export function loadRecentLocations(): LocationData[] {
  if (typeof window === "undefined") return [];
  const k = recentKey();
  if (!k) return [];
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "[]");
  } catch {
    return [];
  }
}

export function saveRecentLocation(loc: LocationData) {
  const k = recentKey();
  if (!k || typeof window === "undefined") return;
  const existing = loadRecentLocations().filter((l) => l.id !== loc.id);
  const next = [loc, ...existing].slice(0, RECENT_LIMIT);
  window.localStorage.setItem(k, JSON.stringify(next));
}

// Derive a recent-style entry from the user's home airport.
export function homeAirportPlace(): LocationData | null {
  const profile = loadProfile();
  if (!profile.homeAirport) return null;
  // Don't have coords without geocoding; expose as a "starter" entry that
  // triggers a real lookup when picked.
  return {
    id: `home-airport-${profile.homeAirport}`,
    name: profile.homeAirport,
    fullName: `${profile.homeAirport} (home airport)`,
    kind: "airport",
    iata: profile.homeAirport,
    lat: 0,
    lng: 0,
  };
}

// In-memory request cache to avoid duplicate fetches across mount/re-render.
const cache = new Map<string, Promise<LocationData[]>>();

export function searchLocations(query: string): Promise<LocationData[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return Promise.resolve([]);
  const cached = cache.get(q);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const json = (await res.json()) as { results?: LocationData[] };
      return json.results ?? [];
    } catch {
      return [];
    }
  })();
  cache.set(q, promise);
  return promise;
}
