"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useRequireAuth } from "@/components/AuthProvider";
import { getTrip } from "@/lib/storage";
import { isMultiStop, routeSummary, tripStops } from "@/lib/trip-stops";
import type { Trip } from "@/lib/types";

export default function WrappedPage() {
  const { user, ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);

  useEffect(() => {
    if (!ready || !user || !params?.id) return;
    setTrip(getTrip(params.id) ?? null);
  }, [ready, user, params?.id]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }
  if (trip === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Loading…
      </div>
    );
  }
  if (trip === null) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold">Trip not found</h1>
        <Link href="/trips" className="btn-primary inline-block mt-6 px-5 py-2.5">
          Back to my trips
        </Link>
      </div>
    );
  }

  return <Wrapped trip={trip} />;
}

function Wrapped({ trip }: { trip: Trip }) {
  const stats = useMemo(() => computeStats(trip), [trip]);

  async function share() {
    const url = window.location.href;
    const title = `My ${routeSummary(trip)} trip — ${trip.itinerary.length} days, ${stats.totalStops} stops`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        alert("Link copied to clipboard");
      } catch {}
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/trips/${trip.id}`}
        className="text-sm text-[var(--muted)] hover:text-white"
      >
        ← Back to trip
      </Link>

      <div
        className="mt-4 rounded-3xl p-8 md:p-12 relative overflow-hidden"
        style={{
          background: `radial-gradient(900px 500px at 80% 0%, rgba(34,211,238,0.18), transparent 60%), radial-gradient(700px 500px at 0% 100%, rgba(167,139,250,0.18), transparent 60%), #07080d`,
        }}
      >
        <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--accent)] uppercase">
          // VOYAGE WRAPPED
        </div>
        <h1 className="mt-4 text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
          Your trip to{" "}
          <span className="text-[var(--accent)] text-glow">
            {routeSummary(trip)}.
          </span>
        </h1>
        {isMultiStop(trip) && (
          <p className="mt-4 text-sm text-[var(--muted)]">
            {tripStops(trip).length} stops · {tripStops(trip).map((s) => s.destination).join(" · ")}
          </p>
        )}
        <p className="mt-3 text-[var(--muted)] text-lg">
          {new Date(trip.startDate).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}{" "}
          —{" "}
          {new Date(trip.endDate).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat big={stats.days.toString()} label="days" accent />
        <Stat big={stats.totalStops.toString()} label="stops" />
        <Stat big={stats.foodStops.toString()} label="meals" />
        <Stat big={stats.activityStops.toString()} label="activities" />
        <Stat big={`${stats.totalKm}`} label="km traveled" />
        <Stat
          big={`${Math.round(stats.totalTravelMin / 60)}h`}
          label="in transit"
        />
      </div>

      <div className="surface mt-6 p-6 rounded-2xl">
        <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
          // BIGGEST DAY
        </div>
        <div className="mt-2 font-semibold text-lg">
          {stats.biggestDay.label}
        </div>
        <div className="text-sm text-[var(--muted)] mt-1">
          {stats.biggestDay.stops} stops · {stats.biggestDay.travelMin} min
          traveling
        </div>
      </div>

      <div className="surface mt-6 p-6 rounded-2xl">
        <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
          // YOUR HIGHLIGHTS
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {stats.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="text-[var(--accent)]">●</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <button
          onClick={share}
          className="btn-primary px-6 py-3.5 font-medium"
        >
          Share my Wrapped →
        </button>
        <button
          onClick={() => window.print()}
          className="btn-ghost px-6 py-3.5 font-medium"
        >
          Save as PDF
        </button>
      </div>

      <p className="mt-8 text-xs text-[var(--muted)] text-center font-mono">
        // Wrapped is auto-generated from your saved itinerary.
      </p>
    </div>
  );
}

function Stat({
  big,
  label,
  accent,
}: {
  big: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="surface rounded-2xl p-5">
      <div
        className={`text-4xl md:text-5xl font-semibold tracking-tight ${
          accent ? "text-[var(--accent)] text-glow" : ""
        }`}
      >
        {big}
      </div>
      <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </div>
    </div>
  );
}

function computeStats(trip: Trip) {
  let totalStops = 0;
  let foodStops = 0;
  let activityStops = 0;
  let totalTravelMin = 0;
  let totalKm = 0;
  let biggestDay = {
    label: trip.itinerary[0]?.label ?? "",
    stops: 0,
    travelMin: 0,
  };

  for (const day of trip.itinerary) {
    let dayTravel = 0;
    for (const it of day.items) {
      totalStops++;
      if (it.category === "food") foodStops++;
      if (it.category === "activity") activityStops++;
      if (it.legBefore) {
        dayTravel += it.legBefore.minutes;
        totalKm += it.legBefore.meters / 1000;
      }
    }
    totalTravelMin += dayTravel;
    if (day.items.length > biggestDay.stops) {
      biggestDay = {
        label: day.label,
        stops: day.items.length,
        travelMin: dayTravel,
      };
    }
  }

  const highlights = [
    `${routeSummary(trip)} for ${trip.travelers} traveler${trip.travelers === 1 ? "" : "s"}`,
    isMultiStop(trip)
      ? `${tripStops(trip).length} stops: ${tripStops(trip).map((s) => `${s.destination} (${s.nights}n)`).join(", ")}`
      : "",
    trip.vibes.length > 0
      ? `Trip vibe: ${trip.vibes.slice(0, 3).join(", ")}`
      : "Open-ended adventure",
    foodStops > 0 ? `${foodStops} meals booked` : "",
    activityStops > 0 ? `${activityStops} planned activities` : "",
    trip.intent ? `Reason: ${trip.intent}` : "",
  ].filter(Boolean);

  return {
    days: trip.itinerary.length,
    totalStops,
    foodStops,
    activityStops,
    totalTravelMin,
    totalKm: Math.round(totalKm),
    biggestDay,
    highlights,
  };
}
