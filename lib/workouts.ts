"use client";

import { getSession } from "./auth";
import { supabase, supabaseEnabled } from "./supabase";
import { eachTripDate } from "./commitments";
import { loadConfirmations } from "./wallet";
import { loadCommitments } from "./commitments";
import { loadProfile } from "./profile";
import type {
  Trip,
  TravelerProfile,
  WorkoutPlanItem,
  WorkoutTime,
  WorkoutType,
} from "./types";

const KEY = "voyage:workouts";

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadWorkouts(tripId?: string): WorkoutPlanItem[] {
  if (typeof window === "undefined") return [];
  const k = localKey();
  if (!k) return [];
  try {
    const all: WorkoutPlanItem[] = JSON.parse(
      window.localStorage.getItem(k) ?? "[]"
    );
    return tripId ? all.filter((w) => w.tripId === tripId) : all;
  } catch {
    return [];
  }
}

function saveAll(items: WorkoutPlanItem[]) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(items));
}

export function upsertWorkout(item: WorkoutPlanItem) {
  const all = loadWorkouts();
  const idx = all.findIndex((w) => w.id === item.id);
  if (idx >= 0) all[idx] = item;
  else all.push(item);
  saveAll(all);
  if (supabaseEnabled && supabase) syncRemote(item).catch(() => {});
}

export function deleteWorkout(id: string) {
  saveAll(loadWorkouts().filter((w) => w.id !== id));
  if (supabaseEnabled && supabase) {
    supabase.from("trip_workouts").delete().eq("id", id).then(() => {});
  }
}

async function syncRemote(item: WorkoutPlanItem) {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("trip_workouts").upsert({
    id: item.id,
    user_id: user.id,
    trip_id: item.tripId,
    date: item.date,
    start_time: item.startTime ?? null,
    end_time: item.endTime ?? null,
    type: item.type,
    venue: item.venue ?? null,
    address: item.address ?? null,
    notes: item.notes ?? null,
    status: item.status,
    created_at: item.createdAt,
  });
}

// Translate the user's preferred wake-time bucket into a default workout slot.
const TIME_SLOTS: Record<WorkoutTime, { start: string; end: string }> = {
  "early-morning": { start: "06:00", end: "07:00" },
  morning: { start: "08:00", end: "09:00" },
  midday: { start: "12:00", end: "13:00" },
  afternoon: { start: "15:00", end: "16:00" },
  evening: { start: "18:00", end: "19:00" },
  "late-night": { start: "21:00", end: "22:00" },
};

function parseHHMM(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function rangesOverlap(
  a: { startMin: number; endMin: number },
  b: { startMin: number; endMin: number }
) {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

// Generate one suggested workout per day for the trip, skipping days where:
//   - the user has a red-eye flight that lands that day
//   - any commitment overlaps the preferred slot
//   - the day already has a planned workout
export function generateSuggestedWorkouts(args: {
  trip: Trip;
  profile?: TravelerProfile;
}): WorkoutPlanItem[] {
  const profile = args.profile ?? loadProfile();
  const slot = TIME_SLOTS[profile.workoutTime ?? "morning"];
  const types: WorkoutType[] = profile.workoutTypes ?? ["weights", "cardio"];

  const wallet = loadConfirmations();
  const commitments = loadCommitments(args.trip.id);
  const existing = loadWorkouts(args.trip.id);

  const suggestions: WorkoutPlanItem[] = [];

  for (const date of eachTripDate(args.trip)) {
    if (existing.some((w) => w.date === date)) continue;

    // Red-eye? If a flight lands before 8am on this date, skip.
    const flights = wallet.filter(
      (w) => w.type === "flight" && w.date === date && w.tripId === args.trip.id
    );
    const hasRedEye = flights.some((f) => {
      const t = parseHHMM(f.time);
      return t !== null && t < 8 * 60;
    });
    if (hasRedEye) continue;

    const slotRange = {
      startMin: parseHHMM(slot.start)!,
      endMin: parseHHMM(slot.end)!,
    };

    const conflict = commitments.some((c) => {
      if (c.date !== date) return false;
      if (c.allDay) return true;
      const sm = parseHHMM(c.startTime) ?? slotRange.startMin;
      const em = parseHHMM(c.endTime) ?? sm + 60;
      return rangesOverlap({ startMin: sm, endMin: em }, slotRange);
    });
    if (conflict) continue;

    const type = types[suggestions.length % Math.max(1, types.length)] ?? "weights";

    suggestions.push({
      id: `wk-sug-${args.trip.id}-${date}`,
      tripId: args.trip.id,
      date,
      startTime: slot.start,
      endTime: slot.end,
      type,
      venue: profile.gymMemberships?.[0]?.brand,
      status: "planned",
      createdAt: new Date().toISOString(),
    });
  }

  return suggestions;
}

// Build a Maps search URL for the gym brand near the user's hotel address.
export function gymSearchUrl(opts: {
  brand: string;
  city?: string;
  hotelAddress?: string;
}): string {
  const q = encodeURIComponent(
    [opts.brand, opts.hotelAddress ?? opts.city].filter(Boolean).join(" near ")
  );
  return `https://www.google.com/maps/search/${q}`;
}
