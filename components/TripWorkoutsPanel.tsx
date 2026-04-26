"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  ExternalLink,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  deleteWorkout,
  generateSuggestedWorkouts,
  gymSearchUrl,
  loadWorkouts,
  upsertWorkout,
} from "@/lib/workouts";
import { loadProfile } from "@/lib/profile";
import type { Trip, WorkoutPlanItem, WorkoutType } from "@/lib/types";

const TYPE_LABELS: Record<WorkoutType | "free", string> = {
  weights: "Weights",
  cardio: "Cardio",
  running: "Run",
  swimming: "Swim",
  yoga: "Yoga",
  hiit: "HIIT",
  crossfit: "CrossFit",
  cycling: "Cycling",
  basketball: "Basketball",
  boxing: "Boxing",
  free: "Free time",
};

export function TripWorkoutsPanel({
  trip,
  storageKey,
}: {
  trip: Trip;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const v = window.localStorage.getItem(storageKey);
    if (v === "1") setOpen(true);
  }, [storageKey]);

  const [items, setItems] = useState<WorkoutPlanItem[]>(() => loadWorkouts(trip.id));
  const profile = useMemo(() => loadProfile(), []);

  function refresh() {
    setItems(loadWorkouts(trip.id));
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  function generate() {
    const suggestions = generateSuggestedWorkouts({ trip, profile });
    suggestions.forEach((s) => upsertWorkout(s));
    refresh();
  }

  const grouped = useMemo(() => {
    const m: Record<string, WorkoutPlanItem[]> = {};
    for (const w of items) (m[w.date] ??= []).push(w);
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const hasGyms = (profile.gymMemberships ?? []).length > 0;

  return (
    <div className="steel mt-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Dumbbell
            size={18}
            strokeWidth={1.75}
            className="text-[var(--accent)] flex-none"
            aria-hidden
          />
          <div className="text-left min-w-0">
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
              WORKOUTS
            </div>
            <div className="text-sm mt-0.5 truncate">
              {items.length === 0
                ? "Plan workouts that fit your schedule"
                : `${items.length} planned · ${grouped.length} day${grouped.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} strokeWidth={1.75} className="flex-none" aria-hidden />
        ) : (
          <ChevronDown size={18} strokeWidth={1.75} className="flex-none" aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--edge)] px-6 py-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-[var(--muted)]">
              We schedule around your commitments and skip days with red-eye
              arrivals. Default time:{" "}
              <span className="font-medium text-[var(--foreground)]">
                {profile.workoutTime ?? "morning"}
              </span>
              .
            </div>
            <button
              onClick={generate}
              className="btn-steel px-3 py-1.5 text-xs inline-flex items-center gap-2"
            >
              <RefreshCw size={12} strokeWidth={1.75} aria-hidden />
              Auto-fill
            </button>
          </div>

          {!hasGyms && (
            <div className="text-xs text-[var(--muted)] border border-[var(--border)] rounded-lg p-3">
              Add gym memberships in your <span className="text-[var(--accent)]">profile</span> so
              we can find a matching gym near your hotel.
            </div>
          )}

          {grouped.length === 0 && (
            <div className="text-sm text-center text-[var(--muted)] py-6">
              No workouts planned. Click Auto-fill to generate suggestions, or
              add one manually.
            </div>
          )}

          <div className="space-y-3">
            {grouped.map(([date, list]) => (
              <div key={date} className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-white/[0.02] text-xs uppercase tracking-wider text-[var(--muted)]">
                  {new Date(date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <ul className="divide-y divide-[var(--edge)]">
                  {list.map((w) => (
                    <li
                      key={w.id}
                      className="px-4 py-3 flex items-center gap-3"
                    >
                      <Activity
                        size={14}
                        strokeWidth={1.75}
                        className="text-[var(--accent)] flex-none"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          {TYPE_LABELS[w.type]}
                          {w.startTime && (
                            <span className="text-[var(--muted)] ml-2 font-mono text-xs">
                              {w.startTime}
                              {w.endTime ? `–${w.endTime}` : ""}
                            </span>
                          )}
                        </div>
                        {w.venue && (
                          <div className="text-xs text-[var(--muted)] mt-0.5 flex items-center gap-1">
                            {w.venue}
                            <a
                              href={gymSearchUrl({
                                brand: w.venue,
                                city: trip.destination,
                              })}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-[var(--accent)]"
                            >
                              <ExternalLink size={11} strokeWidth={1.75} aria-hidden />
                            </a>
                          </div>
                        )}
                      </div>
                      <select
                        className="input"
                        style={{ width: "auto", padding: "4px 8px", fontSize: 12 }}
                        value={w.status}
                        onChange={(e) => {
                          upsertWorkout({
                            ...w,
                            status: e.target.value as WorkoutPlanItem["status"],
                          });
                          refresh();
                        }}
                      >
                        <option value="planned">Planned</option>
                        <option value="done">Done</option>
                        <option value="skipped">Skipped</option>
                      </select>
                      <button
                        onClick={() => {
                          deleteWorkout(w.id);
                          refresh();
                        }}
                        className="text-[var(--muted)] hover:text-[var(--danger)] p-1"
                        aria-label="Delete"
                      >
                        <Trash2 size={13} strokeWidth={1.75} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
