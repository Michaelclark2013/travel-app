"use client";

// Where the user is + where home is. Combines:
//  - Profile.homeAirport (explicit, highest priority for "home")
//  - Browser timezone (good fallback for both home + current when offline)
//  - Geolocation API + reverse-geocode (best "current" answer when allowed)
//
// Result: PlanFromHere buttons can route into /plan with the right origin
// without ever asking the user mid-flow.

import { detectLocale } from "./locale-detect";
import { loadProfile } from "./profile";

export type LocationHint = {
  /** Display label like "New York" or "JFK". */
  label: string;
  /** Source of the hint, for tooltip / fallback decisions. */
  source: "profile" | "geolocation" | "timezone" | "default";
  /** Coordinates when known (geolocation only today). */
  lat?: number;
  lng?: number;
};

const CURRENT_KEY = "voyage:location:current";
const CURRENT_TTL_MS = 30 * 60 * 1000; // 30 min — long enough to feel sticky, short enough to refresh

type CachedCurrent = LocationHint & { fetchedAt: number };

function readCache(): CachedCurrent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCurrent;
    if (Date.now() - parsed.fetchedAt > CURRENT_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(hint: LocationHint) {
  if (typeof window === "undefined") return;
  const v: CachedCurrent = { ...hint, fetchedAt: Date.now() };
  window.localStorage.setItem(CURRENT_KEY, JSON.stringify(v));
}

/** Synchronous best-guess of "where is home." Always returns something. */
export function getHomeLocation(): LocationHint {
  const profile = loadProfile();
  if (profile.homeAirport) {
    return { label: profile.homeAirport, source: "profile" };
  }
  const tz = detectLocale();
  if (tz?.city) {
    return { label: tz.city, source: "timezone" };
  }
  return { label: "New York", source: "default" };
}

/**
 * Fetch the user's current location with Geolocation. We only return a
 * useful (non-cached) result if the browser actually allows it. If denied
 * or unavailable, returns null and callers should fall back to home.
 */
export async function getCurrentLocation(opts: {
  /** Force a fresh GPS fetch even if cache is still fresh. */
  fresh?: boolean;
} = {}): Promise<LocationHint | null> {
  const cached = !opts.fresh ? readCache() : null;
  if (cached) return cached;

  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  const coords = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { maximumAge: 60_000, timeout: 8_000, enableHighAccuracy: false }
    );
  });
  if (!coords) return null;

  const { latitude, longitude } = coords.coords;
  let label = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;

  // Reverse-geocode through our own /api/intel route (uses Mapbox when keyed,
  // falls back to nothing). For now we'll best-effort-grab the nearest place
  // name via the existing geocode endpoint.
  try {
    const res = await fetch(
      `/api/geocode?reverse=1&lat=${latitude}&lng=${longitude}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.name === "string" && data.name) label = data.name;
      if (typeof data?.city === "string" && data.city) label = data.city;
    }
  } catch {}

  const hint: LocationHint = {
    label,
    source: "geolocation",
    lat: latitude,
    lng: longitude,
  };
  writeCache(hint);
  return hint;
}

/**
 * The "best" origin for planning a trip RIGHT NOW. Returns current location
 * if cached/known, otherwise falls back to home. Synchronous + cheap.
 */
export function getPreferredOrigin(): LocationHint {
  return readCache() ?? getHomeLocation();
}

/** Clear the cached current location (used by Settings "stop using my location"). */
export function clearCurrentLocation() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CURRENT_KEY);
}
