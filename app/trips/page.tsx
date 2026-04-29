"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Map } from "lucide-react";
import { deleteTrip, loadTrips, upsertTrip } from "@/lib/storage";
import { useRequireAuth } from "@/components/AuthProvider";
import { LocationImageEl } from "@/components/LocationImage";
import { toast } from "@/lib/toast";
import { isMultiStop, routeSummary, tripStops } from "@/lib/trip-stops";
import type { Trip } from "@/lib/types";
// Track D: soft Pro gate — free accounts capped at 3 saved trips.
// `isPro()` returns true today (Stripe not wired) so this never fires until
// NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is set in Vercel.
import { isPro } from "@/lib/pro";
import UpgradePrompt from "@/components/UpgradePrompt";

const FREE_TRIP_CAP = 3;

export default function TripsPage() {
  const { user, ready } = useRequireAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

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
    const victim = trips.find((t) => t.id === id);
    if (!victim) return;
    deleteTrip(id);
    setTrips(loadTrips());
    toast.undo(`Trip to ${victim.destination} deleted`, () => {
      upsertTrip(victim);
      setTrips(loadTrips());
    });
  }

  // Soft gate: when not Pro and at the free cap, "+ New trip" opens the
  // UpgradePrompt instead of navigating. While isPro() returns true (the
  // current shipping state), this is dormant.
  const overFreeCap = !isPro() && trips.length >= FREE_TRIP_CAP;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <UpgradePrompt
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="saved-trips"
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">My trips</h1>
          <p className="text-[var(--muted)] mt-2">
            Your saved itineraries — pick one back up or start a new one.
          </p>
        </div>
        {overFreeCap ? (
          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            className="btn-primary px-5 py-2.5 text-sm"
          >
            + New trip · Pro
          </button>
        ) : (
          <Link href="/plan" className="btn-primary px-5 py-2.5 text-sm">
            + New trip
          </Link>
        )}
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
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            {[
              { label: "🥂 Weekend in Lisbon", to: "/plan?destination=Lisbon&days=3" },
              { label: "🍜 5 days in Tokyo", to: "/plan?destination=Tokyo&days=5" },
              { label: "🏔️ Iceland adventure", to: "/plan?destination=Reykjav%C3%ADk&days=6" },
              { label: "💞 Honeymoon in Bali", to: "/plan?destination=Bali&days=7" },
            ].map((c) => (
              <Link
                key={c.label}
                href={c.to}
                className="rounded-full border border-[var(--border-strong)] bg-[var(--card-strong)] px-3 py-1.5 text-xs hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                {c.label}
              </Link>
            ))}
          </div>
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
          <div className="font-bold text-xl">{routeSummary(trip)}</div>
          <div className="text-sm text-[var(--muted)] mt-1.5">
            {start} — {end} · {trip.itinerary.length} day
            {trip.itinerary.length === 1 ? "" : "s"}
            {isMultiStop(trip) && (
              <> · {tripStops(trip).length} stops</>
            )}
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
