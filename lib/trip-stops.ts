// Helpers for working with multi-stop trips. Single-destination trips use the
// existing Trip.destination field; multi-stop trips populate Trip.stops.
// All consumers should go through these helpers so the migration stays in one
// place.

import type { Trip, TripStop } from "./types";

export function makeStop(
  destination: string,
  nights: number,
  extra: Partial<Omit<TripStop, "id" | "destination" | "nights">> = {}
): TripStop {
  return {
    id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    destination: destination.trim(),
    nights: Math.max(1, Math.round(nights)),
    ...extra,
  };
}

/** Returns the canonical stops list for any trip — synthesizes one if absent. */
export function tripStops(trip: Trip): TripStop[] {
  if (trip.stops && trip.stops.length > 0) return trip.stops;
  // Single-destination back-compat path.
  const ms =
    new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime();
  const nights = Math.max(1, Math.round(ms / 86_400_000));
  return [
    {
      id: "stop-primary",
      destination: trip.destination,
      nights,
      vibes: trip.vibes,
    },
  ];
}

export function isMultiStop(trip: Trip): boolean {
  return (trip.stops?.length ?? 0) > 1;
}

/** "Tokyo → Kyoto → Osaka" or "Tokyo" for single-stop. */
export function routeSummary(trip: Trip): string {
  return tripStops(trip)
    .map((s) => s.destination)
    .join(" → ");
}

/** Sum of nights across all stops. */
export function totalNights(stops: TripStop[]): number {
  return stops.reduce((n, s) => n + Math.max(1, s.nights), 0);
}

/**
 * Given stops + a startDate (YYYY-MM-DD), return the date each stop begins
 * along with its endDate (last full night). Useful for itinerary day labelling
 * and the trip detail page header.
 */
export function stopSchedule(
  stops: TripStop[],
  startDate: string
): { stop: TripStop; from: string; to: string }[] {
  const out: { stop: TripStop; from: string; to: string }[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  for (const s of stops) {
    const from = isoDay(cursor);
    cursor.setDate(cursor.getDate() + Math.max(1, s.nights));
    const to = isoDay(addDays(cursor, -1));
    out.push({ stop: s, from, to });
  }
  return out;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Computed end date given start + nights total — single source of truth. */
export function endDateForStops(startDate: string, stops: TripStop[]): string {
  const total = totalNights(stops);
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + total);
  return d.toISOString().slice(0, 10);
}
