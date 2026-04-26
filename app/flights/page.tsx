"use client";

import { useEffect, useMemo, useState } from "react";
import { generateFlights } from "@/lib/mock-data";
import { useRequireAuth } from "@/components/AuthProvider";
import type { Flight } from "@/lib/types";

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

export default function FlightsPage() {
  const { user, ready } = useRequireAuth();
  const [from, setFrom] = useState("JFK");
  const [to, setTo] = useState("NRT");
  const [date, setDate] = useState(todayISO(14));
  const [sort, setSort] = useState<"price" | "duration" | "stops">("price");
  const [maxStops, setMaxStops] = useState<0 | 1 | 2>(2);
  const [searched, setSearched] = useState(false);
  const [allFlights, setAllFlights] = useState<Flight[]>([]);
  const [source, setSource] = useState<"mock" | "amadeus" | "loading" | null>(
    null
  );

  useEffect(() => {
    if (!searched) return;
    let cancelled = false;
    setSource("loading");
    const params = new URLSearchParams({ from, to, date });
    fetch(`/api/flights?${params}`)
      .then((r) => r.json())
      .then((data: { source: "mock" | "amadeus"; flights: Flight[] }) => {
        if (cancelled) return;
        setAllFlights(data.flights ?? []);
        setSource(data.source);
      })
      .catch(() => {
        if (cancelled) return;
        setAllFlights(generateFlights(from, to, date));
        setSource("mock");
      });
    return () => {
      cancelled = true;
    };
  }, [searched, from, to, date]);

  const flights = useMemo(() => {
    return allFlights
      .filter((f) => f.stops <= maxStops)
      .sort((a, b) => {
        if (sort === "price") return a.price - b.price;
        if (sort === "duration") return a.durationMinutes - b.durationMinutes;
        return a.stops - b.stops;
      });
  }, [allFlights, sort, maxStops]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">Find a flight</h1>
      <p className="text-[var(--muted)] mt-3">
        Search across airlines. Sorted by cheapest by default.
      </p>
      {source && (
        <div className="mt-2 inline-flex items-center gap-2 text-[10px] font-mono tracking-[0.18em] uppercase">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              source === "amadeus"
                ? "bg-[var(--accent)] pulse-dot"
                : "bg-[var(--muted)]"
            }`}
          />
          <span className="text-[var(--muted)]">
            {source === "amadeus"
              ? "● Live data · Amadeus"
              : source === "loading"
              ? "Loading…"
              : "Demo data · Add AMADEUS_API_KEY for live"}
          </span>
        </div>
      )}

      <div className="steel mt-6 p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3">
          <Input label="From" value={from} onChange={setFrom} />
          <Input label="To" value={to} onChange={setTo} />
          <DateInput label="Depart" value={date} onChange={setDate} />
          <button
            onClick={() => setSearched(true)}
            className="btn-primary self-end px-6 py-3 text-base"
          >
            Search
          </button>
        </div>
      </div>

      {searched && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--muted)] mr-1">Sort by</span>
            {(["price", "duration", "stops"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`border px-3 py-1.5 text-sm capitalize ${
                  sort === s ? "bg-white text-black border-white" : "btn-steel"
                }`}
              >
                {s}
              </button>
            ))}
            <span className="ml-4 text-sm text-[var(--muted)] mr-1">Stops</span>
            {([0, 1, 2] as const).map((n) => (
              <button
                key={n}
                onClick={() => setMaxStops(n)}
                className={`border px-3 py-1.5 text-sm ${
                  maxStops === n
                    ? "bg-white text-black border-white"
                    : "btn-steel"
                }`}
              >
                {n === 0 ? "Nonstop" : `≤ ${n} stops`}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {flights.length === 0 && (
              <div className="steel p-10 text-center text-[var(--muted)]">
                No flights match those filters.
              </div>
            )}
            {flights.map((f, i) => (
              <FlightCard
                key={f.id}
                flight={f}
                cheapest={i === 0 && sort === "price"}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FlightCard({
  flight,
  cheapest,
}: {
  flight: Flight;
  cheapest: boolean;
}) {
  return (
    <div className="steel p-5 flex items-center gap-6 hover:brightness-125 transition">
      <div className="flex h-12 w-12 items-center justify-center bg-black/50 border border-[var(--edge)] text-xl">
        ✈️
      </div>
      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
        <div>
          <div className="text-xs text-[var(--muted)]">Airline</div>
          <div className="font-medium">{flight.airline}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">Times</div>
          <div className="font-medium">
            {flight.departTime} → {flight.arriveTime}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">Duration</div>
          <div>
            {fmtDuration(flight.durationMinutes)}{" "}
            <span className="text-[var(--muted)]">
              ·{" "}
              {flight.stops === 0
                ? "Nonstop"
                : `${flight.stops} stop${flight.stops === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">Route</div>
          <div className="font-medium">
            {flight.from} → {flight.to}
          </div>
        </div>
      </div>
      <div className="text-right">
        {cheapest && (
          <div className="text-[10px] font-bold tracking-[0.18em] uppercase mb-1">
            Cheapest
          </div>
        )}
        <div className="text-2xl font-bold tracking-tight">${flight.price}</div>
        <button className="mt-1 text-xs text-[var(--muted)] hover:text-white">
          Select →
        </button>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[var(--foreground)] mb-2 block">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[var(--foreground)] mb-2 block">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </label>
  );
}
