"use client";

import type { Trip } from "./types";
import { getSession } from "./auth";
import { supabase, supabaseEnabled } from "./supabase";

// Local-storage shim — used when Supabase isn't configured. Same keying as before
// so existing demo data still works.

function localKey(): string | null {
  const u = getSession();
  return u ? `voyage:trips:${u.id}` : null;
}

function loadLocal(): Trip[] {
  if (typeof window === "undefined") return [];
  const k = localKey();
  if (!k) return [];
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as Trip[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(trips: Trip[]) {
  if (typeof window === "undefined") return;
  const k = localKey();
  if (!k) return;
  window.localStorage.setItem(k, JSON.stringify(trips));
}

// ----- Public API: localStorage versions kept for synchronous reads. -----

export function loadTrips(): Trip[] {
  return loadLocal();
}

export function saveTrips(trips: Trip[]) {
  saveLocal(trips);
}

export function getTrip(id: string): Trip | undefined {
  return loadLocal().find((t) => t.id === id);
}

export function upsertTrip(trip: Trip) {
  const trips = loadLocal();
  const idx = trips.findIndex((t) => t.id === trip.id);
  if (idx >= 0) trips[idx] = trip;
  else trips.unshift(trip);
  saveLocal(trips);
  // Mirror to Supabase if available — fire-and-forget so callers don't have to await.
  if (supabaseEnabled && supabase) {
    upsertTripRemote(trip).catch(() => {});
  }
  return trip;
}

export function deleteTrip(id: string) {
  saveLocal(loadLocal().filter((t) => t.id !== id));
  if (supabaseEnabled && supabase) {
    supabase.from("trips").delete().eq("id", id).then(() => {});
  }
}

// ----- Async / remote-first variants for pages that can await. -----

export async function loadTripsAsync(): Promise<Trip[]> {
  if (supabaseEnabled && supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error || !data) return loadLocal();
    return data.map(rowToTrip);
  }
  return loadLocal();
}

export async function getTripAsync(id: string): Promise<Trip | undefined> {
  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!error && data) return rowToTrip(data);
  }
  return loadLocal().find((t) => t.id === id);
}

async function upsertTripRemote(trip: Trip) {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("trips").upsert(tripToRow(trip, user.id));
}

// ----- Mappers -----

type TripRow = {
  id: string;
  user_id: string;
  destination: string;
  origin: string;
  start_date: string;
  end_date: string;
  travelers: number;
  budget: number | null;
  vibes: string[];
  intent: string | null;
  with_kids: boolean | null;
  accessibility: boolean | null;
  carbon_aware: boolean | null;
  itinerary: Trip["itinerary"];
  selected_flight_id: string | null;
  selected_hotel_id: string | null;
  transport_mode: string;
  invitees: Trip["invitees"];
  expenses: Trip["expenses"];
  created_at: string;
};

function tripToRow(trip: Trip, userId: string): TripRow {
  return {
    id: trip.id,
    user_id: userId,
    destination: trip.destination,
    origin: trip.origin,
    start_date: trip.startDate,
    end_date: trip.endDate,
    travelers: trip.travelers,
    budget: trip.budget ?? null,
    vibes: trip.vibes,
    intent: trip.intent ?? null,
    with_kids: trip.withKids ?? false,
    accessibility: trip.accessibility ?? false,
    carbon_aware: trip.carbonAware ?? false,
    itinerary: trip.itinerary,
    selected_flight_id: trip.selectedFlightId ?? null,
    selected_hotel_id: trip.selectedHotelId ?? null,
    transport_mode: trip.transportMode,
    invitees: trip.invitees ?? [],
    expenses: trip.expenses ?? [],
    created_at: trip.createdAt,
  };
}

function rowToTrip(row: TripRow): Trip {
  return {
    id: row.id,
    destination: row.destination,
    origin: row.origin,
    startDate: row.start_date,
    endDate: row.end_date,
    travelers: row.travelers,
    budget: row.budget ?? undefined,
    vibes: row.vibes ?? [],
    intent: (row.intent as Trip["intent"]) ?? undefined,
    withKids: row.with_kids ?? undefined,
    accessibility: row.accessibility ?? undefined,
    carbonAware: row.carbon_aware ?? undefined,
    itinerary: row.itinerary ?? [],
    selectedFlightId: row.selected_flight_id ?? undefined,
    selectedHotelId: row.selected_hotel_id ?? undefined,
    transportMode: row.transport_mode as Trip["transportMode"],
    invitees: row.invitees ?? [],
    expenses: row.expenses ?? [],
    createdAt: row.created_at,
  };
}
