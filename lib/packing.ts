"use client";

import { getSession } from "./auth";
import type { Trip, TripPreferences } from "./types";

export type PackingCategory =
  | "clothes"
  | "toiletries"
  | "electronics"
  | "documents"
  | "medications"
  | "gear";

export type PackingItem = {
  id: string;
  tripId: string;
  category: PackingCategory;
  label: string;
  packed: boolean;
  custom?: boolean;
};

const KEY = "voyage:packing";

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadPacking(tripId: string): PackingItem[] {
  if (typeof window === "undefined") return [];
  const k = localKey();
  if (!k) return [];
  try {
    const all: PackingItem[] = JSON.parse(window.localStorage.getItem(k) ?? "[]");
    return all.filter((p) => p.tripId === tripId);
  } catch {
    return [];
  }
}

export function savePacking(tripId: string, items: PackingItem[]) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  try {
    const all: PackingItem[] = JSON.parse(window.localStorage.getItem(k) ?? "[]");
    const others = all.filter((p) => p.tripId !== tripId);
    window.localStorage.setItem(k, JSON.stringify([...others, ...items]));
  } catch {
    window.localStorage.setItem(k, JSON.stringify(items));
  }
}

// Generate a categorized packing list from the trip + profile preferences.
// This is a template-based "AI" — heuristics over destination keywords,
// season, trip length, and the user's preferences.
export function generatePacking(trip: Trip): PackingItem[] {
  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const days = Math.max(
    1,
    Math.round(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1
  );
  const month = startDate.getMonth();
  const isWinter = month <= 1 || month === 11;
  const isSummer = month >= 5 && month <= 8;
  const dest = trip.destination.toLowerCase();

  const beach = /beach|hawaii|cancun|maldives|bali|thailand|riviera/.test(dest);
  const mountain = /alps|aspen|whistler|denver|tahoe|mountain|ski|reykjav/.test(dest);
  const tropical = beach || /singapore|bangkok|costa rica|saigon/.test(dest);
  const cosmopolitan = /tokyo|paris|london|new york|nyc|barcelona|rome|berlin/.test(dest);

  const prefs: TripPreferences | undefined = trip.preferences;

  const items: { category: PackingCategory; label: string }[] = [];

  // Clothes
  items.push({ category: "clothes", label: `Underwear (×${Math.min(days + 2, 10)})` });
  items.push({ category: "clothes", label: `Socks (×${Math.min(days + 2, 10)})` });
  items.push({ category: "clothes", label: `Shirts (×${Math.min(days, 8)})` });
  items.push({ category: "clothes", label: "Pants / shorts" });
  items.push({ category: "clothes", label: "Sleepwear" });
  if (isWinter || mountain) {
    items.push({ category: "clothes", label: "Warm jacket / coat" });
    items.push({ category: "clothes", label: "Beanie + gloves" });
    items.push({ category: "clothes", label: "Thermal layer" });
  }
  if (isSummer || tropical) {
    items.push({ category: "clothes", label: "Sunglasses" });
    items.push({ category: "clothes", label: "Sunhat" });
  }
  if (beach) {
    items.push({ category: "clothes", label: "Swimsuit" });
    items.push({ category: "gear", label: "Beach towel" });
    items.push({ category: "gear", label: "Reef-safe sunscreen" });
  }
  if (mountain) {
    items.push({ category: "gear", label: "Hiking boots" });
    items.push({ category: "gear", label: "Daypack" });
  }
  if (cosmopolitan) {
    items.push({ category: "clothes", label: "One nicer outfit" });
  }
  if (prefs?.travelStyle === "luxury") {
    items.push({ category: "clothes", label: "Smart-casual jacket / blazer" });
  }
  if (prefs?.activityLevel === "active" || prefs?.activityLevel === "extreme") {
    items.push({ category: "clothes", label: "Workout clothes" });
    items.push({ category: "gear", label: "Athletic shoes" });
  }

  // Toiletries
  items.push({ category: "toiletries", label: "Toothbrush + toothpaste" });
  items.push({ category: "toiletries", label: "Deodorant" });
  items.push({ category: "toiletries", label: "Shampoo + conditioner" });
  items.push({ category: "toiletries", label: "Razor / shaving kit" });
  items.push({ category: "toiletries", label: "Skincare basics" });
  if (isSummer || tropical) {
    items.push({ category: "toiletries", label: "Sunscreen SPF 30+" });
    items.push({ category: "toiletries", label: "Bug spray" });
  }

  // Electronics
  items.push({ category: "electronics", label: "Phone charger" });
  items.push({ category: "electronics", label: "Battery pack" });
  items.push({ category: "electronics", label: "Headphones" });
  items.push({ category: "electronics", label: "Travel adapter" });
  if (days >= 3) items.push({ category: "electronics", label: "Laptop or tablet" });

  // Documents
  items.push({ category: "documents", label: "Passport / ID" });
  items.push({ category: "documents", label: "Boarding passes" });
  items.push({ category: "documents", label: "Hotel confirmations" });
  if (prefs?.insurance?.policyNumber) {
    items.push({ category: "documents", label: "Travel insurance card" });
  }
  if (prefs?.emergencyContacts && prefs.emergencyContacts.length > 0) {
    items.push({ category: "documents", label: "Emergency contact card" });
  }

  // Medications
  items.push({ category: "medications", label: "Pain reliever" });
  items.push({ category: "medications", label: "Stomach / motion sickness pills" });
  items.push({ category: "medications", label: "Personal prescriptions" });
  if (prefs?.dietaryRestrictions?.includes("Nut allergy")) {
    items.push({ category: "medications", label: "EpiPen" });
  }

  // Gear
  if (days >= 4) items.push({ category: "gear", label: "Reusable water bottle" });
  if (cosmopolitan || mountain || beach) {
    items.push({ category: "gear", label: "Comfortable walking shoes" });
  }
  items.push({ category: "gear", label: "Day bag / packable tote" });

  return items.map((row, idx) => ({
    id: `pck-${trip.id}-${idx}`,
    tripId: trip.id,
    category: row.category,
    label: row.label,
    packed: false,
  }));
}
