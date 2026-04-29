"use client";

// Per-user planner defaults. Restores last-used values on next visit so the
// sidebar isn't a blank slate every time.

import { getSession } from "./auth";
import type { TransportMode, TripIntent } from "./types";

export type PlannerDefaults = {
  origin?: string;
  travelers?: number;
  budget?: number;
  intent?: TripIntent;
  vibes?: string[];
  mode?: TransportMode;
  withKids?: boolean;
  accessibility?: boolean;
  carbonAware?: boolean;
  /** Trip length in days — used to auto-set endDate when only startDate moves. */
  preferredDuration?: number;
};

const KEY = "voyage:planner-defaults";

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadPlannerDefaults(): PlannerDefaults {
  if (typeof window === "undefined") return {};
  const k = localKey();
  if (!k) return {};
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "{}");
  } catch {
    return {};
  }
}

export function savePlannerDefaults(patch: Partial<PlannerDefaults>) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  const current = loadPlannerDefaults();
  const next = { ...current, ...patch };
  window.localStorage.setItem(k, JSON.stringify(next));
}

export function resetPlannerDefaults() {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  window.localStorage.removeItem(k);
}
