"use client";

import { getSession } from "./auth";
import { supabase, supabaseEnabled } from "./supabase";
import { loadConfirmations, type Confirmation } from "./wallet";
import type {
  Commitment,
  DayPlan,
  DayPlanItem,
  DayPlanSuggestionKind,
  Trip,
  TripPreferences,
} from "./types";

// ============================================================================
// Local storage (mirror to Supabase when authed)
// ============================================================================

const KEY = "voyage:commitments";
const DISMISSED_KEY = "voyage:commitments-dismissed";

function userId(): string | null {
  return getSession()?.id ?? null;
}

function localKey(): string | null {
  const u = userId();
  return u ? `${KEY}:${u}` : null;
}

function dismissedKey(): string | null {
  const u = userId();
  return u ? `${DISMISSED_KEY}:${u}` : null;
}

export function loadCommitments(tripId?: string): Commitment[] {
  if (typeof window === "undefined") return [];
  const k = localKey();
  if (!k) return [];
  try {
    const all: Commitment[] = JSON.parse(window.localStorage.getItem(k) ?? "[]");
    return tripId ? all.filter((c) => c.tripId === tripId) : all;
  } catch {
    return [];
  }
}

function saveAllLocal(items: Commitment[]) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(items));
}

export function addCommitment(c: Commitment) {
  const all = loadCommitments();
  all.push(c);
  saveAllLocal(all);
  if (supabaseEnabled && supabase) upsertRemote(c).catch(() => {});
}

export function updateCommitment(id: string, patch: Partial<Commitment>) {
  const all = loadCommitments();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const next = { ...all[idx], ...patch, id };
  all[idx] = next;
  saveAllLocal(all);
  if (supabaseEnabled && supabase) upsertRemote(next).catch(() => {});
  return next;
}

export function deleteCommitment(id: string) {
  saveAllLocal(loadCommitments().filter((c) => c.id !== id));
  if (supabaseEnabled && supabase) {
    supabase.from("trip_commitments").delete().eq("id", id).then(() => {});
  }
}

export async function loadCommitmentsAsync(tripId: string): Promise<Commitment[]> {
  if (supabaseEnabled && supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from("trip_commitments")
        .select("*")
        .eq("user_id", user.id)
        .eq("trip_id", tripId)
        .order("date", { ascending: true });
      if (!error && data) {
        const items = data.map(rowToCommitment);
        // Mirror remote into local so the rest of the page can read sync.
        const all = loadCommitments();
        const others = all.filter((c) => c.tripId !== tripId);
        saveAllLocal([...others, ...items]);
        return items;
      }
    }
  }
  return loadCommitments(tripId);
}

async function upsertRemote(c: Commitment) {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("trip_commitments").upsert(commitmentToRow(c, user.id));
}

type CommitmentRow = {
  id: string;
  user_id: string;
  trip_id: string;
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  priority: string;
  notes: string | null;
  created_at: string;
};

function commitmentToRow(c: Commitment, userIdv: string): CommitmentRow {
  return {
    id: c.id,
    user_id: userIdv,
    trip_id: c.tripId,
    title: c.title,
    address: c.address ?? null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    date: c.date,
    start_time: c.startTime ?? null,
    end_time: c.endTime ?? null,
    all_day: c.allDay ?? false,
    priority: c.priority,
    notes: c.notes ?? null,
    created_at: c.createdAt,
  };
}

function rowToCommitment(r: CommitmentRow): Commitment {
  return {
    id: r.id,
    tripId: r.trip_id,
    title: r.title,
    address: r.address ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    date: r.date,
    startTime: r.start_time ?? undefined,
    endTime: r.end_time ?? undefined,
    allDay: r.all_day,
    priority: r.priority as Commitment["priority"],
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

// ============================================================================
// Dismissed suggestions
// ============================================================================

export function loadDismissed(): Record<string, true> {
  if (typeof window === "undefined") return {};
  const k = dismissedKey();
  if (!k) return {};
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "{}");
  } catch {
    return {};
  }
}

export function dismissSuggestion(signature: string) {
  const k = dismissedKey();
  if (!k || typeof window === "undefined") return;
  const map = loadDismissed();
  map[signature] = true;
  window.localStorage.setItem(k, JSON.stringify(map));
}

export function clearDismissed(tripId: string, date?: string) {
  const k = dismissedKey();
  if (!k || typeof window === "undefined") return;
  const map = loadDismissed();
  for (const key of Object.keys(map)) {
    if (key.startsWith(`${tripId}:${date ?? ""}`)) delete map[key];
  }
  window.localStorage.setItem(k, JSON.stringify(map));
}

// ============================================================================
// Gap analysis + suggestion pool
// ============================================================================

const DAY_START = 7 * 60; // 7am
const DAY_END = 22 * 60; // 10pm
const BUFFER_BEFORE_COMMITMENT = 30; // minutes
const MIN_GAP_FOR_SUGGESTION = 45; // below this we just show transit/buffer

function toMinutes(time?: string): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function fmt(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

type SuggestionTemplate = {
  label: string;
  detail: string;
  type: DayPlanSuggestionKind;
  /** Time-of-day window (in minutes-since-midnight). */
  earliest: number;
  latest: number;
  /** Minutes the activity itself takes. */
  duration: number;
  /** True if the suggestion benefits from a "destination flavor". */
  destinationFlavored?: boolean;
  /** Tags used to filter against user preferences. */
  tags?: string[];
};

const POOL: SuggestionTemplate[] = [
  // Breakfast
  {
    label: "Breakfast at a local cafe",
    detail: "Start the day somewhere walkable — pastry, espresso, watch the city wake up.",
    type: "meal",
    earliest: 7 * 60,
    latest: 10 * 60 + 30,
    duration: 60,
    tags: ["breakfast", "cafe"],
  },
  {
    label: "Hotel breakfast",
    detail: "Skip the search — eat on-site before heading out.",
    type: "meal",
    earliest: 7 * 60,
    latest: 10 * 60,
    duration: 45,
    tags: ["breakfast", "hotel"],
  },
  // Morning activity
  {
    label: "Morning walk + photo stops",
    detail: "Catch the light at one of the iconic spots before crowds arrive.",
    type: "activity",
    earliest: 7 * 60,
    latest: 11 * 60,
    duration: 90,
    destinationFlavored: true,
    tags: ["photography", "walking", "outdoor"],
  },
  {
    label: "Coffee + journaling",
    detail: "Quiet corner spot near the hotel.",
    type: "activity",
    earliest: 7 * 60,
    latest: 11 * 60,
    duration: 45,
    tags: ["relaxed", "cafe"],
  },
  // Lunch
  {
    label: "Lunch nearby",
    detail: "Grab something in the next neighborhood over so you don't double back.",
    type: "meal",
    earliest: 11 * 60 + 30,
    latest: 14 * 60 + 30,
    duration: 75,
    tags: ["lunch"],
  },
  {
    label: "Quick lunch — counter / casual",
    detail: "Fast bite that respects the schedule. Aim for a local favorite.",
    type: "meal",
    earliest: 11 * 60 + 30,
    latest: 14 * 60,
    duration: 45,
    tags: ["lunch", "casual"],
  },
  // Afternoon activity
  {
    label: "Museum or gallery visit",
    detail: "Indoor, climate-controlled, ~90–120 min.",
    type: "activity",
    earliest: 10 * 60,
    latest: 17 * 60,
    duration: 110,
    destinationFlavored: true,
    tags: ["cultural", "museums"],
  },
  {
    label: "Local market wander",
    detail: "Browse food stalls and crafts. Easy to fit any time of day.",
    type: "activity",
    earliest: 10 * 60,
    latest: 18 * 60,
    duration: 75,
    destinationFlavored: true,
    tags: ["shopping", "casual"],
  },
  {
    label: "Park / waterfront break",
    detail: "Bench, view, breath. Especially good between a meeting and dinner.",
    type: "activity",
    earliest: 10 * 60,
    latest: 19 * 60,
    duration: 60,
    tags: ["outdoor", "relaxed", "beaches"],
  },
  {
    label: "Afternoon tasting — coffee / pastry / wine",
    detail: "Short, focused stop. Perfect for a 60–90 min gap.",
    type: "activity",
    earliest: 13 * 60,
    latest: 18 * 60,
    duration: 60,
    tags: ["foodie", "cafe"],
  },
  // Evening
  {
    label: "Dinner at a destination-flavored spot",
    detail: "Save room — pick something representative of the city.",
    type: "meal",
    earliest: 17 * 60 + 30,
    latest: 21 * 60,
    duration: 105,
    destinationFlavored: true,
    tags: ["dinner"],
  },
  {
    label: "Sunset viewpoint",
    detail: "Find a high point or the waterfront 30 min before sunset.",
    type: "activity",
    earliest: 16 * 60,
    latest: 20 * 60,
    duration: 60,
    destinationFlavored: true,
    tags: ["photography", "outdoor", "relaxed"],
  },
  {
    label: "Live music / casual bar",
    detail: "One drink, one set. Don't over-commit if you've got an early start.",
    type: "activity",
    earliest: 19 * 60,
    latest: 23 * 60,
    duration: 90,
    tags: ["nightlife", "Live music", "Casual bars"],
  },
];

function preferenceTags(prefs?: TripPreferences): Set<string> {
  const tags = new Set<string>();
  if (!prefs) return tags;
  for (const c of prefs.culturalInterests ?? []) tags.add(c);
  for (const o of prefs.outdoorInterests ?? []) tags.add(o);
  for (const n of prefs.nightlifeInterests ?? []) tags.add(n);
  if (prefs.photographyInterest) tags.add("photography");
  if (prefs.shoppingInterest && prefs.shoppingInterest !== "none") {
    tags.add("shopping");
  }
  if (prefs.activityLevel === "relaxed") tags.add("relaxed");
  if (prefs.activityLevel === "active" || prefs.activityLevel === "extreme") {
    tags.add("walking");
    tags.add("outdoor");
  }
  if (prefs.travelStyle) tags.add(prefs.travelStyle);
  if (prefs.coffee && prefs.coffee !== "no-coffee") tags.add("cafe");
  if (prefs.breakfast === "hotel") tags.add("hotel");
  if (prefs.breakfast === "local-cafe") tags.add("cafe");
  if (prefs.cuisinesLiked && prefs.cuisinesLiked.length > 0) tags.add("foodie");
  return tags;
}

function destinationFlavor(label: string, destination?: string): string {
  if (!destination) return label;
  return label.replace("destination-flavored", destination);
}

// Build the day plan for a single date by merging:
//  - explicit commitments on that date
//  - wallet items whose date matches
//  - generated suggestions filling the remaining gaps
export function buildDayPlan(args: {
  date: string;
  trip: Trip;
  commitments: Commitment[];
  wallet: Confirmation[];
  dismissed: Record<string, true>;
}): DayPlan {
  const { date, trip, commitments, wallet, dismissed } = args;

  const fixed: { startMin: number; endMin: number; item: DayPlanItem }[] = [];

  for (const c of commitments) {
    if (c.date !== date) continue;
    let startMin = toMinutes(c.startTime) ?? DAY_START;
    let endMin = toMinutes(c.endTime) ?? startMin + 60;
    if (c.allDay) {
      startMin = DAY_START;
      endMin = DAY_END;
    }
    fixed.push({
      startMin,
      endMin,
      item: { kind: "commitment", id: c.id, commitment: c, startMin, endMin },
    });
  }

  for (const w of wallet) {
    if (w.date !== date) continue;
    const sm = toMinutes(w.time) ?? (w.type === "hotel" ? 15 * 60 : DAY_START);
    let em = sm + 90;
    if (w.type === "hotel") em = sm + 30; // check-in window
    if (w.type === "restaurant") em = sm + 90;
    if (w.type === "flight") em = sm + 120;
    fixed.push({
      startMin: sm,
      endMin: em,
      item: {
        kind: "wallet",
        id: w.id,
        label: w.title,
        vendor: w.vendor,
        icon: w.type,
        startMin: sm,
        endMin: em,
      },
    });
  }

  fixed.sort((a, b) => a.startMin - b.startMin);

  // Compute open gaps respecting BUFFER_BEFORE_COMMITMENT.
  const gaps: { startMin: number; endMin: number }[] = [];
  let cursor = DAY_START;
  for (const block of fixed) {
    const blockedStart = block.startMin - BUFFER_BEFORE_COMMITMENT;
    if (blockedStart - cursor >= MIN_GAP_FOR_SUGGESTION) {
      gaps.push({ startMin: cursor, endMin: blockedStart });
    }
    cursor = Math.max(cursor, block.endMin);
  }
  if (DAY_END - cursor >= MIN_GAP_FOR_SUGGESTION) {
    gaps.push({ startMin: cursor, endMin: DAY_END });
  }

  // Generate suggestions for each gap.
  const userTags = preferenceTags(trip.preferences);
  const dislikedCuisines = new Set(trip.preferences?.cuisinesDisliked ?? []);

  const suggestions: DayPlanItem[] = [];
  for (const gap of gaps) {
    const length = gap.endMin - gap.startMin;
    if (length < MIN_GAP_FOR_SUGGESTION) continue;

    if (length < 90) {
      suggestions.push({
        kind: "suggestion",
        id: `transit-${date}-${gap.startMin}`,
        label: "Travel + buffer",
        detail: `${length} min between commitments — keep this open.`,
        type: "transit",
        startMin: gap.startMin,
        endMin: gap.endMin,
      });
      continue;
    }

    // Score templates that fit in this gap.
    const candidates = POOL.filter(
      (t) =>
        t.duration <= length - 15 &&
        gap.startMin <= t.latest &&
        gap.endMin >= t.earliest
    );

    if (candidates.length === 0) {
      suggestions.push({
        kind: "suggestion",
        id: `buffer-${date}-${gap.startMin}`,
        label: "Free time",
        detail: `${length} min — wander, rest, or improvise.`,
        type: "buffer",
        startMin: gap.startMin,
        endMin: gap.endMin,
      });
      continue;
    }

    const scored = candidates
      .map((t) => {
        let score = 1;
        for (const tag of t.tags ?? []) {
          if (userTags.has(tag)) score += 2;
        }
        if (length >= 180 && t.type === "meal") score += 1;
        return { t, score };
      })
      .sort((a, b) => b.score - a.score);

    // First fill: prefer a meal if the gap covers a typical meal time.
    const startsAt = Math.max(gap.startMin, scored[0].t.earliest);
    const picked: SuggestionTemplate[] = [];
    let used = 0;
    let cursorIn = startsAt;
    for (const { t } of scored) {
      if (picked.length >= 2) break;
      if (used + t.duration + 15 > length) continue;
      // Avoid suggesting two meals in the same gap.
      if (t.type === "meal" && picked.some((p) => p.type === "meal")) continue;
      // Avoid disliked cuisines surfacing in detail copy.
      if (
        t.type === "meal" &&
        [...dislikedCuisines].some((c) => t.detail.toLowerCase().includes(c.toLowerCase()))
      ) {
        continue;
      }
      picked.push(t);
      used += t.duration + 15;
    }

    let inner = cursorIn;
    for (const t of picked) {
      const endMin = Math.min(inner + t.duration, gap.endMin);
      const detail = destinationFlavor(t.detail, trip.destination);
      const sig = `${trip.id}:${date}:${t.label}`;
      if (dismissed[sig]) {
        inner = endMin + 15;
        continue;
      }
      suggestions.push({
        kind: "suggestion",
        id: `sug-${date}-${inner}`,
        label: t.label,
        detail,
        type: t.type,
        startMin: inner,
        endMin,
      });
      inner = endMin + 15;
    }
  }

  const items = [
    ...fixed.map((f) => f.item),
    ...suggestions,
  ].sort((a, b) => a.startMin - b.startMin);

  return { date, items };
}

export function buildSuggestionSignature(
  tripId: string,
  date: string,
  label: string
) {
  return `${tripId}:${date}:${label}`;
}

export function formatTimeRange(startMin: number, endMin: number): string {
  return `${fmt(startMin)} – ${fmt(endMin)}`;
}

export function eachTripDate(trip: Trip): string[] {
  const out: string[] = [];
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  for (
    let d = new Date(start);
    d <= end;
    d.setDate(d.getDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Wallet items helper that scopes to the trip.
export function tripWallet(trip: Trip): Confirmation[] {
  const all = loadConfirmations();
  return all.filter(
    (c) => c.tripId === trip.id || (c.date >= trip.startDate && c.date <= trip.endDate)
  );
}
