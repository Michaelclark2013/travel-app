"use client";

import { useEffect, useMemo, useState } from "react";
import { generateHotels } from "@/lib/mock-data";
import { useRequireAuth } from "@/components/AuthProvider";
import type { Hotel } from "@/lib/types";

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function HotelsPage() {
  const { user, ready } = useRequireAuth();
  const [city, setCity] = useState("Tokyo");
  const [checkIn, setCheckIn] = useState(todayISO(14));
  const [checkOut, setCheckOut] = useState(todayISO(19));
  const [guests, setGuests] = useState(2);
  const [sort, setSort] = useState<"price" | "rating">("price");
  const [searched, setSearched] = useState(false);

  const nights = useMemo(() => {
    const ms =
      new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
  }, [checkIn, checkOut]);

  const [allHotels, setAllHotels] = useState<Hotel[]>([]);
  const [source, setSource] = useState<"mock" | "amadeus" | "loading" | null>(
    null
  );

  useEffect(() => {
    if (!searched) return;
    let cancelled = false;
    setSource("loading");
    const params = new URLSearchParams({
      city,
      checkIn,
      checkOut,
      travelers: String(guests),
    });
    fetch(`/api/hotels?${params}`)
      .then((r) => r.json())
      .then((data: { source: "mock" | "amadeus"; hotels: Hotel[] }) => {
        if (cancelled) return;
        setAllHotels(data.hotels ?? []);
        setSource(data.source);
      })
      .catch(() => {
        if (cancelled) return;
        setAllHotels(generateHotels(city, checkIn));
        setSource("mock");
      });
    return () => {
      cancelled = true;
    };
  }, [searched, city, checkIn, checkOut, guests]);

  const hotels = useMemo(() => {
    return [...allHotels].sort((a, b) =>
      sort === "price" ? a.pricePerNight - b.pricePerNight : b.rating - a.rating
    );
  }, [allHotels, sort]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">Find a hotel</h1>
      <p className="text-[var(--muted)] mt-3">
        Stays sorted by price, with ratings and amenities at a glance.
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
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_120px_auto] gap-3">
          <Input label="City" value={city} onChange={setCity} />
          <DateInput label="Check-in" value={checkIn} onChange={setCheckIn} />
          <DateInput
            label="Check-out"
            value={checkOut}
            onChange={setCheckOut}
          />
          <NumInput label="Guests" value={guests} onChange={setGuests} />
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
            {(["price", "rating"] as const).map((s) => (
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
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {hotels.map((h) => (
              <HotelCard key={h.id} hotel={h} nights={nights} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HotelCard({ hotel, nights }: { hotel: Hotel; nights: number }) {
  return (
    <div className="steel overflow-hidden hover:brightness-110 transition">
      <div
        className="h-40 w-full"
        style={{
          background: `linear-gradient(135deg, hsl(${hotel.imageHue} 30% 35%), hsl(${(hotel.imageHue + 60) % 360} 25% 18%))`,
        }}
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg">{hotel.name}</h3>
            <p className="text-sm text-[var(--muted)]">{hotel.city}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--muted)]">per night</div>
            <div className="text-xl font-bold tracking-tight">
              ${hotel.pricePerNight}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="font-medium">⭐ {hotel.rating.toFixed(1)}</span>
          <span className="text-[var(--muted)]">
            ({hotel.reviews.toLocaleString()} reviews)
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hotel.amenities.map((a) => (
            <span
              key={a}
              className="bg-white/8 border border-[var(--edge)] px-2 py-0.5 text-xs"
            >
              {a}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-[var(--muted)]">
            ${hotel.pricePerNight * nights} total · {nights} night
            {nights === 1 ? "" : "s"}
          </span>
          <button className="btn-primary px-4 py-2 text-sm">Select</button>
        </div>
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

function NumInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[var(--foreground)] mb-2 block">
        {label}
      </span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value)))}
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
