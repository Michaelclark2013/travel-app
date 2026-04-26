"use client";

import { getSession } from "./auth";
import { loadTrips } from "./storage";

export type Confirmation = {
  id: string;
  tripId?: string;
  type: "flight" | "hotel" | "car" | "restaurant" | "activity" | "train";
  title: string;
  vendor: string;
  reference: string;
  date: string;
  time?: string;
  detail: string;
  totalUsd?: number;
  source: "auto-import" | "manual";
};

const KEY = "voyage:wallet";

function key(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadConfirmations(): Confirmation[] {
  if (typeof window === "undefined") return [];
  const k = key();
  if (!k) return [];
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "[]");
  } catch {
    return [];
  }
}

export function saveConfirmations(items: Confirmation[]) {
  const k = key();
  if (!k || typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(items));
}

export function addConfirmation(c: Confirmation) {
  const items = loadConfirmations();
  items.unshift(c);
  saveConfirmations(items);
}

// Naive parser — recognizes a few common confirmation patterns.
// Real implementation would use Claude/GPT or a vendor like Mailparser.
export function parseEmail(raw: string): Confirmation | null {
  const text = raw.trim();
  const lower = text.toLowerCase();

  function match(re: RegExp): string | null {
    return text.match(re)?.[1]?.trim() ?? null;
  }

  let type: Confirmation["type"] | null = null;
  let vendor = "Unknown";
  let title = "Confirmation";

  if (/(boarding pass|flight|airline|delta|united|jetblue|alaska|aa\.com)/i.test(lower)) {
    type = "flight";
    vendor =
      match(/(Delta|United|American|JetBlue|Alaska|Southwest|Lufthansa|British Airways|Air France)/i) ??
      "Airline";
    title = "Flight booked";
  } else if (/(hotel|reservation|airbnb|marriott|hilton|hyatt|resort)/i.test(lower)) {
    type = "hotel";
    vendor = match(/(Marriott|Hilton|Hyatt|Airbnb|IHG|Booking\.com)/i) ?? "Hotel";
    title = "Stay booked";
  } else if (/(rental car|hertz|enterprise|avis|sixt|budget rent)/i.test(lower)) {
    type = "car";
    vendor = match(/(Hertz|Enterprise|Avis|Sixt|Budget|National)/i) ?? "Rental car";
    title = "Rental car booked";
  } else if (/(opentable|resy|tock|reservation at)/i.test(lower)) {
    type = "restaurant";
    vendor = match(/(OpenTable|Resy|Tock)/i) ?? "Restaurant";
    title = "Dinner reservation";
  } else if (/(viator|getyourguide|klook|tickets for|admission)/i.test(lower)) {
    type = "activity";
    vendor = match(/(Viator|GetYourGuide|Klook|Tiqets|Headout)/i) ?? "Activity";
    title = "Activity booked";
  } else if (/(train|amtrak|trenitalia|sncf|eurostar|rail)/i.test(lower)) {
    type = "train";
    vendor = match(/(Amtrak|Eurostar|Trenitalia|SNCF|Renfe)/i) ?? "Rail";
    title = "Train ticket";
  }

  if (!type) return null;

  const reference =
    match(/confirmation[#:\s]*([A-Z0-9-]{4,})/i) ??
    match(/booking[#:\s]*([A-Z0-9-]{4,})/i) ??
    match(/ref[#:\s]*([A-Z0-9-]{4,})/i) ??
    `VYG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4})/);
  const date = dateMatch ? new Date(dateMatch[0]).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/);
  const time = timeMatch?.[1];
  const totalMatch = text.match(/\$(\d{1,5}(?:[.,]\d{2})?)/);
  const totalUsd = totalMatch ? parseFloat(totalMatch[1].replace(",", "")) : undefined;

  // Try to attach to a trip whose date range covers this date.
  const trips = loadTrips();
  const trip = trips.find(
    (t) => date >= t.startDate && date <= t.endDate
  );

  return {
    id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tripId: trip?.id,
    type,
    title,
    vendor,
    reference,
    date,
    time,
    detail: text.split("\n").slice(0, 2).join(" — ").slice(0, 140),
    totalUsd,
    source: "auto-import",
  };
}
