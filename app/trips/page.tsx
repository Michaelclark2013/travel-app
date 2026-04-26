"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Map } from "lucide-react";
import { deleteTrip, loadTrips } from "@/lib/storage";
import { useRequireAuth } from "@/components/AuthProvider";
import { LocationImageEl } from "@/components/LocationImage";
import type { Trip } from "@/lib/types";

export default function TripsPage() {
  const { user, ready } = useRequireAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    setTrips(loadTrips());
    setHydrated(true);
  }, [ready, user]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this trip?")) return;
    deleteTrip(id);
    setTrips(loadTrips());
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">My trips</h1>
          <p className="text-[var(--muted)] mt-2">
            Your saved itineraries — pick one back up or start a new one.
          </p>
        </div>
        <Link href="/plan" className="btn-primary px-5 py-2.5 text-sm">
          + New trip
        </Link>
      </div>

      {hydrated && trips.length === 0 && (
        <div className="steel mt-10 p-12 text-center">
          <div className="mb-5 flex justify-center text-[var(--muted)]" aria-hidden>
            <Map size={56} strokeWidth={1.25} />
          </div>
          <h3 className="text-2xl font-bold tracking-tight">
            No trips yet
          </h3>
          <p className="text-[var(--muted)] mt-3">
            Plan your first trip — it takes about a minute.
          </p>
          <Link
            href="/plan"
            className="btn-primary inline-block mt-7 px-6 py-3 text-base"
          >
            Plan a trip
          </Link>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} onDelete={() => handleDelete(t.id)} />
        ))}
      </div>
    </div>
  );
}

function TripCard({
  trip,
  onDelete,
}: {
  trip: Trip;
  onDelete: () => void;
}) {
  const start = new Date(trip.startDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const end = new Date(trip.endDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const totalActivities = trip.itinerary.reduce(
    (sum, d) => sum + d.items.length,
    0
  );

  return (
    <div className="group relative steel angle-tr overflow-hidden hover:brightness-125 transition">
      <Link href={`/trips/${trip.id}`} className="block">
        <LocationImageEl
          name={trip.destination}
          kind="city"
          aspect="16/9"
          rounded="none"
          className="w-full"
        />
        <div className="p-5">
          <div className="font-bold text-xl">{trip.destination}</div>
          <div className="text-sm text-[var(--muted)] mt-1.5">
            {start} — {end} · {trip.itinerary.length} day
            {trip.itinerary.length === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-[var(--muted)] mt-2">
            {totalActivities} planned stops
          </div>
        </div>
      </Link>
      <button
        onClick={onDelete}
        className="absolute top-3 right-3 bg-black/80 backdrop-blur border border-[var(--edge)] px-2.5 py-1 text-xs text-[var(--muted)] opacity-0 group-hover:opacity-100 transition hover:text-[var(--danger)]"
      >
        Delete
      </button>
      <Link
        href={`/plan?rebook=${encodeURIComponent(trip.id)}`}
        className="absolute top-3 right-[5.5rem] bg-black/80 backdrop-blur border border-[var(--edge)] px-2.5 py-1 text-xs text-[var(--muted)] opacity-0 group-hover:opacity-100 transition hover:text-[var(--accent)]"
        title="Plan a similar trip"
      >
        Rebook
      </Link>
    </div>
  );
}
