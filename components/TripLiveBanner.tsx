"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CloudRain, Plane, RefreshCw } from "lucide-react";
import { loadConfirmations } from "@/lib/wallet";
import { mockFlightStatus, mockWeather } from "@/lib/disruptions";
import { eachTripDate } from "@/lib/commitments";
import type { Trip } from "@/lib/types";

// Polling-based live data banner. Today this drives off the mock disruption
// engine; swapping in AviationStack / OpenWeather is a one-file change in
// lib/disruptions.ts. Polls every 5 min by default, every 60s when within
// 2 hours of a flight.

const FAR_INTERVAL_MS = 5 * 60 * 1000;
const NEAR_INTERVAL_MS = 60 * 1000;

export function TripLiveBanner({ trip }: { trip: Trip }) {
  const [tick, setTick] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const flights = loadConfirmations().filter(
        (w) =>
          w.type === "flight" &&
          (w.tripId === trip.id || (w.date >= trip.startDate && w.date <= trip.endDate))
      );
      const now = Date.now();
      const minDistanceMs = flights.reduce<number>((acc, f) => {
        const t = f.time ?? "12:00";
        const dt = new Date(`${f.date}T${t}:00`);
        const distance = dt.getTime() - now;
        if (distance < 0) return acc;
        return Math.min(acc, distance);
      }, Infinity);
      const interval =
        Number.isFinite(minDistanceMs) && minDistanceMs <= 2 * 60 * 60 * 1000
          ? NEAR_INTERVAL_MS
          : FAR_INTERVAL_MS;
      timer = setTimeout(() => {
        setTick((n) => n + 1);
        setRefreshedAt(new Date());
        schedule();
      }, interval);
    }
    schedule();
    return () => clearTimeout(timer);
  }, [trip.id, trip.startDate, trip.endDate]);

  const today = new Date().toISOString().slice(0, 10);
  const wallet = loadConfirmations();

  const upcomingFlights = wallet.filter(
    (w) =>
      w.type === "flight" &&
      (w.tripId === trip.id || (w.date >= trip.startDate && w.date <= trip.endDate)) &&
      w.date >= today
  );

  const flightAlerts = upcomingFlights
    .map((f) => ({ flight: f, snap: mockFlightStatus(f) }))
    .filter((x) => x.snap.severity !== "info");

  const dates = eachTripDate(trip);
  const weather = mockWeather(trip.destination, dates);
  const rainyDays = weather.filter(
    (w) => w.summary === "rainy" || w.summary === "stormy"
  );

  if (flightAlerts.length === 0 && rainyDays.length === 0) {
    return null;
  }

  void tick;

  return (
    <div className="mt-6 space-y-2">
      {flightAlerts.map(({ flight, snap }) => (
        <div
          key={flight.id}
          className={`steel p-4 flex items-center gap-3 border-l-2 ${
            snap.severity === "error"
              ? "border-l-[var(--danger)]"
              : "border-l-amber-400"
          }`}
        >
          <Plane
            size={18}
            strokeWidth={1.75}
            className={
              snap.severity === "error" ? "text-[var(--danger)]" : "text-amber-400"
            }
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">
              {flight.vendor} · {flight.from ?? "—"} → {flight.to ?? "—"}
            </div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              {snap.message}
              {snap.gate ? ` · Gate ${snap.gate}` : ""}
              {snap.terminal ? ` · T${snap.terminal}` : ""}
            </div>
          </div>
          <div className="text-[11px] text-[var(--muted)] hidden sm:flex items-center gap-1">
            <RefreshCw size={11} strokeWidth={1.75} aria-hidden />
            {refreshedAt.toLocaleTimeString()}
          </div>
        </div>
      ))}
      {rainyDays.slice(0, 1).map((w) => (
        <div
          key={w.date}
          className="steel p-4 flex items-center gap-3 border-l-2 border-l-sky-400"
        >
          <CloudRain
            size={18}
            strokeWidth={1.75}
            className="text-sky-400"
            aria-hidden
          />
          <div className="flex-1 min-w-0 text-sm">
            <span className="font-medium">
              Rain forecast for{" "}
              {new Date(w.date).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <span className="text-[var(--muted)] ml-2">
              {w.precipChance}% chance · {w.lowF}°–{w.highF}°F
            </span>
            <span className="text-[var(--muted)] ml-2">
              · Consider moving outdoor plans to a sunnier day.
            </span>
          </div>
        </div>
      ))}
      {flightAlerts.length === 0 && rainyDays.length === 0 && null}
      {flightAlerts.length === 0 && rainyDays.length === 0 && (
        <div className="text-xs text-[var(--muted)]">
          <AlertTriangle size={11} strokeWidth={1.75} className="inline mr-1" />
          No disruptions detected.
        </div>
      )}
    </div>
  );
}
