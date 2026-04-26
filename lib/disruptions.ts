"use client";

// Mock live-data engine for flight + weather disruptions.
// Real implementation would poll AviationStack / OpenWeather here.
// We keep all data deterministic-by-id so demos are stable.

import type { Confirmation, FlightStatus } from "./wallet";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type LiveFlightSnapshot = {
  status: FlightStatus;
  delayMinutes: number;
  gate?: string;
  terminal?: string;
  message: string;
  severity: "info" | "warn" | "error";
  fetchedAt: string;
};

const STATUSES: FlightStatus[] = [
  "scheduled",
  "on-time",
  "boarding",
  "delayed",
];

export function mockFlightStatus(c: Confirmation): LiveFlightSnapshot {
  const seed = hash(c.id);
  const today = new Date().toISOString().slice(0, 10);
  const isPast = c.date < today;

  if (isPast) {
    return {
      status: "arrived",
      delayMinutes: 0,
      message: "Arrived",
      severity: "info",
      fetchedAt: new Date().toISOString(),
    };
  }

  const status = STATUSES[seed % STATUSES.length];
  const delay = status === "delayed" ? 25 + (seed % 90) : 0;
  const gate = `${String.fromCharCode(65 + (seed % 6))}${10 + (seed % 25)}`;
  const terminal = `${1 + (seed % 4)}`;

  let message = "";
  let severity: LiveFlightSnapshot["severity"] = "info";
  if (status === "delayed") {
    message = `Delayed ${delay} min — new departure ${addMinutes(c.time, delay)}`;
    severity = delay >= 60 ? "error" : "warn";
  } else if (status === "boarding") {
    message = `Boarding now at gate ${gate}`;
  } else if (status === "scheduled") {
    message = "Scheduled — on time";
  } else {
    message = "On time";
  }

  return {
    status,
    delayMinutes: delay,
    gate,
    terminal,
    message,
    severity,
    fetchedAt: new Date().toISOString(),
  };
}

export type WeatherDay = {
  date: string;
  summary: "sunny" | "cloudy" | "rainy" | "stormy" | "snowy";
  highF: number;
  lowF: number;
  precipChance: number;
};

export function mockWeather(destination: string, dates: string[]): WeatherDay[] {
  const seed = hash(destination);
  const summaries: WeatherDay["summary"][] = [
    "sunny",
    "cloudy",
    "rainy",
    "sunny",
    "cloudy",
    "stormy",
    "sunny",
  ];
  return dates.map((date, i) => {
    const k = (seed + i * 37) % summaries.length;
    return {
      date,
      summary: summaries[k],
      highF: 60 + (((seed + i) * 7) % 30),
      lowF: 45 + (((seed + i) * 5) % 20),
      precipChance: summaries[k] === "rainy" || summaries[k] === "stormy" ? 60 + (i * 5) % 30 : 5,
    };
  });
}

function addMinutes(time: string | undefined, mins: number): string {
  if (!time) return "—";
  const m = /(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  const total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + mins;
  const h = Math.floor((total / 60) % 24);
  const mm = total % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}
