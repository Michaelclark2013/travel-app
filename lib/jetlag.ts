"use client";

// Jet-lag recovery planner. Builds a 3-days-before / 3-days-after schedule
// based on the time-zone delta between home and destination. The hard
// rules below are derived from the Jet Lag Rooster method — shift bedtime
// 30–60 min/day for east-bound, push it later for west-bound.

import type { Trip } from "./types";

export type JetLagDay = {
  /** Day relative to arrival. -3 = three days before, 0 = arrival day. */
  dayOffset: number;
  /** Phase the user is in. */
  phase: "pre" | "arrival" | "post";
  bedtimeLocal: string;
  wakeTimeLocal: string;
  caffeineCutoff: string;
  /** Window in which to seek bright light (or avoid it). */
  lightExposure: { start: string; end: string; type: "seek" | "avoid" };
  melatonin?: string;
  notes: string;
};

export type JetLagPlan = {
  homeOffsetHours: number;
  destinationOffsetHours: number;
  deltaHours: number;
  direction: "east" | "west" | "none";
  days: JetLagDay[];
};

const DESTINATION_TZ_HINTS: { match: RegExp; offset: number }[] = [
  { match: /tokyo|osaka|kyoto|japan/i, offset: 9 },
  { match: /seoul|korea/i, offset: 9 },
  { match: /bangkok|thailand|saigon|hanoi|vietnam/i, offset: 7 },
  { match: /singapore|kuala lumpur|hong kong|shanghai|beijing/i, offset: 8 },
  { match: /sydney|melbourne|australia/i, offset: 11 },
  { match: /london|edinburgh|dublin|england|uk|britain/i, offset: 0 },
  { match: /paris|france|rome|italy|madrid|spain|berlin|amsterdam|lisbon|portugal/i, offset: 1 },
  { match: /dubai|abu dhabi|uae/i, offset: 4 },
  { match: /mumbai|delhi|india/i, offset: 5.5 },
  { match: /new york|nyc|miami|boston|toronto/i, offset: -5 },
  { match: /chicago|houston|dallas/i, offset: -6 },
  { match: /denver|phoenix/i, offset: -7 },
  { match: /los angeles|san francisco|seattle|vancouver/i, offset: -8 },
  { match: /honolulu|hawaii/i, offset: -10 },
  { match: /mexico|cdmx/i, offset: -6 },
  { match: /sao paulo|rio|brazil/i, offset: -3 },
];

function destinationOffset(destination: string): number | null {
  const hit = DESTINATION_TZ_HINTS.find((d) => d.match.test(destination));
  return hit ? hit.offset : null;
}

function homeOffsetHours(): number {
  // Use the user's browser offset as a proxy for "home".
  return -new Date().getTimezoneOffset() / 60;
}

function shiftTime(base: string, hours: number): string {
  const m = /(\d{1,2}):(\d{2})/.exec(base);
  if (!m) return base;
  const total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + hours * 60;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const mm = Math.round(wrapped % 60);
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

export function buildJetLagPlan(trip: Trip): JetLagPlan | null {
  const dest = destinationOffset(trip.destination);
  const home = homeOffsetHours();
  if (dest === null) return null;
  const delta = dest - home;
  if (Math.abs(delta) < 3) return null; // not worth a plan
  const direction = delta > 0 ? "east" : "west";

  // Daily shift in minutes. East: advance bedtime earlier each day. West: push later.
  const dailyShiftMin = 60 * (direction === "east" ? -1 : 1);

  const days: JetLagDay[] = [];

  for (let day = -3; day <= 0; day++) {
    const baseBedtime = "22:30";
    const baseWake = "06:30";
    const shiftMins = dailyShiftMin * (3 + day); // -3 → 0, 0 → 3 days of shifting
    const bedtime = shiftTime(baseBedtime, shiftMins / 60);
    const wakeTime = shiftTime(baseWake, shiftMins / 60);
    days.push({
      dayOffset: day,
      phase: day === 0 ? "arrival" : "pre",
      bedtimeLocal: bedtime,
      wakeTimeLocal: wakeTime,
      caffeineCutoff: shiftTime("14:00", shiftMins / 60),
      lightExposure: {
        start: direction === "east" ? "06:00" : "16:00",
        end: direction === "east" ? "10:00" : "20:00",
        type: "seek",
      },
      melatonin:
        direction === "east"
          ? `0.5 mg ~30 min before bed (${bedtime})`
          : "Skip melatonin — push bedtime later naturally.",
      notes:
        day === 0
          ? "Stay outside in daylight on arrival day. Avoid napping past 4pm local time."
          : day === -3
            ? "Start shifting today — small change, easier than waking up jet-lagged."
            : `Shift ${Math.abs(dailyShiftMin)} min ${direction === "east" ? "earlier" : "later"} than yesterday.`,
    });
  }

  for (let day = 1; day <= 3; day++) {
    const targetBedtime = direction === "east" ? "22:00" : "23:30";
    const targetWake = direction === "east" ? "06:00" : "07:30";
    days.push({
      dayOffset: day,
      phase: "post",
      bedtimeLocal: targetBedtime,
      wakeTimeLocal: targetWake,
      caffeineCutoff: "14:00",
      lightExposure: {
        start: direction === "east" ? "07:00" : "16:00",
        end: direction === "east" ? "11:00" : "19:00",
        type: "seek",
      },
      melatonin:
        direction === "east"
          ? `0.5 mg ~30 min before ${targetBedtime}`
          : "Tapering off — only if having trouble sleeping.",
      notes:
        day === 1
          ? "Hardest day. Get sunlight before noon, eat on local schedule."
          : `Day ${day} — your body should be syncing.`,
    });
  }

  return {
    homeOffsetHours: home,
    destinationOffsetHours: dest,
    deltaHours: delta,
    direction,
    days,
  };
}
