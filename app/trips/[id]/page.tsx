"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { deleteTrip, getTrip, upsertTrip } from "@/lib/storage";
import { useRequireAuth } from "@/components/AuthProvider";
import { TripPreferencesPanel } from "@/components/TripPreferencesPanel";
import { TripCommitmentsPanel } from "@/components/TripCommitmentsPanel";
import { TripWorkoutsPanel } from "@/components/TripWorkoutsPanel";
import { TripPackingPanel } from "@/components/TripPackingPanel";
import { TripLiveBanner } from "@/components/TripLiveBanner";
import { CurrencyConverter } from "@/components/CurrencyConverter";
import { DestinationIntelPanel } from "@/components/DestinationIntelPanel";
import {
  AirportCompanion,
  DepartureChecklist,
  EventsCard,
  JetLagCard,
  VoiceCommandButton,
} from "@/components/TripExtras";
import { LocationImageEl } from "@/components/LocationImage";
import type { ItineraryItem, Trip, TripExpense, TripPreferences } from "@/lib/types";

function LegRow({ item }: { item: ItineraryItem }) {
  const leg = item.legBefore!;
  const icon = leg.mode === "walk" ? "🚶" : leg.mode === "drive" ? "🚗" : "🚇";
  const label =
    leg.mode === "walk" ? "walk" : leg.mode === "drive" ? "drive" : "transit";
  const km = (leg.meters / 1000).toFixed(1);
  return (
    <div className="px-6 py-2.5 flex items-center gap-3 bg-black/40 border-y border-[var(--hairline)]">
      <div className="w-14" />
      <div className="text-xs text-[var(--muted)] flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        <span>
          {leg.minutes} min by {label} · {km} km
        </span>
      </div>
    </div>
  );
}

export default function TripDetailPage() {
  const { user, ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);

  useEffect(() => {
    if (!ready || !user) return;
    if (!params?.id) return;
    setTrip(getTrip(params.id) ?? null);
  }, [params?.id, ready, user]);

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
        <p className="text-[var(--muted)] mt-2">
          It may have been deleted, or this link is from another browser.
        </p>
        <Link
          href="/trips"
          className="btn-primary inline-block mt-6 px-5 py-2.5"
        >
          Back to my trips
        </Link>
      </div>
    );
  }

  function update(next: Trip) {
    setTrip(next);
    upsertTrip(next);
  }

  function handleDelete() {
    if (!confirm("Delete this trip?")) return;
    deleteTrip(trip!.id);
    router.push("/trips");
  }

  function handleAddItem(dayIndex: number) {
    const time = prompt("Time (HH:MM)?", "12:00");
    if (!time) return;
    const title = prompt("What's the plan?");
    if (!title) return;
    const item: ItineraryItem = {
      id: `custom-${Date.now()}`,
      time,
      title,
      description: "",
      category: "activity",
    };
    const next: Trip = {
      ...trip!,
      itinerary: trip!.itinerary.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              items: [...d.items, item].sort((a, b) =>
                a.time.localeCompare(b.time)
              ),
            }
          : d
      ),
    };
    update(next);
  }

  function handleDisruption(dayIndex: number, fromTime: string) {
    // Trim the day's items at the disruption time and replace with a "rest of
    // day" placeholder. A real impl would call the planner with constraints.
    const day = trip!.itinerary[dayIndex];
    const survivors = day.items.filter((it) => it.time < fromTime);
    const replacement: ItineraryItem = {
      id: `replan-${Date.now()}`,
      time: fromTime,
      title: "Re-planned: flexible afternoon",
      description:
        "Voyage held this slot open. Add a stop or regenerate from here.",
      category: "activity",
    };
    const next: Trip = {
      ...trip!,
      itinerary: trip!.itinerary.map((d, i) =>
        i === dayIndex
          ? { ...d, items: [...survivors, replacement] }
          : d
      ),
    };
    update(next);
  }

  function handleAddInvitee() {
    const email = prompt("Friend's email?");
    if (!email) return;
    const name = prompt("Their name?") ?? email.split("@")[0];
    const next: Trip = {
      ...trip!,
      invitees: [
        ...(trip!.invitees ?? []),
        { email, name, status: "pending" },
      ],
    };
    update(next);
  }

  function handleAddExpense() {
    const description = prompt("What's the expense?");
    if (!description) return;
    const amount = Number(prompt("Amount in USD?", "100"));
    if (Number.isNaN(amount) || amount <= 0) return;
    const paidBy = prompt("Who paid?", user!.name) ?? user!.name;
    const next: Trip = {
      ...trip!,
      expenses: [
        ...(trip!.expenses ?? []),
        {
          id: `exp-${Date.now()}`,
          description,
          amountUsd: amount,
          paidBy,
          splitAmong: [user!.name, ...(trip!.invitees ?? []).map((i) => i.name ?? i.email)],
          date: new Date().toISOString().slice(0, 10),
        } as TripExpense,
      ],
    };
    update(next);
  }

  function handleRemoveItem(dayIndex: number, itemId: string) {
    const next: Trip = {
      ...trip!,
      itinerary: trip!.itinerary.map((d, i) =>
        i === dayIndex
          ? { ...d, items: d.items.filter((it) => it.id !== itemId) }
          : d
      ),
    };
    update(next);
  }

  const start = new Date(trip.startDate).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const end = new Date(trip.endDate).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const today = new Date().toISOString().slice(0, 10);
  const isActive = today >= trip.startDate && today <= trip.endDate;
  const todayIdx = trip.itinerary.findIndex((d) => d.date === today);
  const todayLive = isActive && todayIdx >= 0 ? trip.itinerary[todayIdx] : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/trips"
        className="text-sm text-[var(--muted)] hover:text-white"
      >
        ← All trips
      </Link>

      <div className="steel angle-tr-lg mt-4 relative overflow-hidden">
        <div className="absolute inset-0">
          <LocationImageEl
            name={trip.destination}
            kind="city"
            aspect="21/9"
            rounded="none"
            overlay
            loading="eager"
            className="h-full w-full"
          />
        </div>
        <div className="relative p-8 md:p-10 min-h-[260px] flex flex-col justify-end">
          <h1 className="text-5xl font-bold tracking-tight">
            {trip.destination}
          </h1>
          <div className="mt-3 text-white/85 text-lg">
            {start} — {end} · {trip.travelers} traveler
            {trip.travelers === 1 ? "" : "s"}
            {trip.budget ? ` · $${trip.budget.toLocaleString()} budget` : ""}
          </div>
          {trip.vibes.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {trip.vibes.map((v) => (
                <span
                  key={v}
                  className="bg-white/10 border border-[var(--edge)] px-3 py-1 text-xs font-medium"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <TripLiveBanner trip={trip} />

      <AirportCompanion trip={trip} />
      <DepartureChecklist trip={trip} />

      <DestinationIntelPanel
        trip={trip}
        storageKey={`voyage:trip-intel-open:${trip.id}`}
      />

      <JetLagCard trip={trip} storageKey={`voyage:trip-jetlag-open:${trip.id}`} />

      <EventsCard trip={trip} storageKey={`voyage:trip-events-open:${trip.id}`} />

      {todayLive && <LiveCompanion day={todayLive} />}

      <TripPreferencesPanel
        value={trip.preferences}
        onChange={(preferences: TripPreferences) =>
          update({ ...trip!, preferences })
        }
        storageKey={`voyage:trip-prefs-open:${trip.id}`}
      />

      <TripCommitmentsPanel
        trip={trip}
        storageKey={`voyage:trip-commitments-open:${trip.id}`}
      />

      <TripWorkoutsPanel
        trip={trip}
        storageKey={`voyage:trip-workouts-open:${trip.id}`}
      />

      <TripPackingPanel
        trip={trip}
        storageKey={`voyage:trip-packing-open:${trip.id}`}
      />

      <CurrencyConverter destination={trip.destination} />

      <VoiceCommandButton trip={trip} />

      <GroupPanel
        trip={trip}
        currentUser={user.name}
        onAddInvitee={handleAddInvitee}
        onAddExpense={handleAddExpense}
      />

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link
          href={`/flights?from=${encodeURIComponent(trip.origin)}&to=${encodeURIComponent(trip.destination)}&date=${trip.startDate}`}
          className="steel p-5 hover:brightness-125 transition"
        >
          <div className="font-bold">Find flights</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {trip.origin} → {trip.destination}
          </div>
        </Link>
        <Link
          href={`/hotels?city=${encodeURIComponent(trip.destination)}`}
          className="steel p-5 hover:brightness-125 transition"
        >
          <div className="font-bold">Find hotels</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {trip.destination}
          </div>
        </Link>
        <Link
          href={`/nearby?city=${encodeURIComponent(trip.destination)}`}
          className="steel p-5 hover:brightness-125 transition"
        >
          <div className="font-bold">Food &amp; coffee nearby</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            Use your location while you&apos;re there
          </div>
        </Link>
        <Link
          href={`/esim?destination=${encodeURIComponent(trip.destination)}&days=${trip.itinerary.length}`}
          className="steel p-5 hover:brightness-125 transition"
        >
          <div className="font-bold">Travel eSIM</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            Skip roaming charges
          </div>
        </Link>
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">
          Your day-by-day plan
        </h2>
        <button
          onClick={handleDelete}
          className="text-sm text-[var(--danger)] hover:underline"
        >
          Delete trip
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {trip.itinerary.map((day, idx) => (
          <div key={day.date} className="steel overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--edge)] flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                  Day {idx + 1}
                </div>
                <div className="font-bold text-lg">{day.label}</div>
              </div>
              <div className="flex items-center gap-3">
                {(() => {
                  const total = day.items.reduce(
                    (s, it) => s + (it.legBefore?.minutes ?? 0),
                    0
                  );
                  return total > 0 ? (
                    <span className="text-xs text-[var(--muted)]">
                      ~{total} min traveling
                    </span>
                  ) : null;
                })()}
                <button
                  onClick={() => handleAddItem(idx)}
                  className="btn-steel text-sm px-3 py-1.5"
                >
                  + Add stop
                </button>
                <button
                  onClick={() => {
                    const t = prompt(
                      "Something change? What time should we re-plan from? (HH:MM)",
                      "12:00"
                    );
                    if (t) handleDisruption(idx, t);
                  }}
                  className="btn-steel text-sm px-3 py-1.5"
                  title="Re-plan the rest of this day"
                >
                  ⚡ Re-plan
                </button>
              </div>
            </div>
            <ol>
              {day.items.map((it, j) => (
                <li key={it.id}>
                  {it.legBefore && <LegRow item={it} />}
                  <div
                    className={`group flex gap-4 px-6 py-4 hover:bg-white/[0.02] ${j > 0 && !it.legBefore ? "border-t border-[var(--edge)]" : ""}`}
                  >
                    <div className="w-14 text-sm font-mono text-[var(--muted)] shrink-0">
                      {it.time}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CategoryDot category={it.category} />
                        <span className="font-medium">{it.title}</span>
                        {it.location && (
                          <span className="text-xs text-[var(--muted)]">
                            · {it.location.name}
                          </span>
                        )}
                      </div>
                      {it.description && (
                        <p className="text-sm text-[var(--muted)] mt-1">
                          {it.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveItem(idx, it.id)}
                      className="text-xs text-[var(--muted)] hover:text-red-600 opacity-0 group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
              {day.items.length === 0 && (
                <li className="px-6 py-6 text-sm text-[var(--muted)] text-center">
                  No stops yet for this day.
                </li>
              )}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryDot({ category }: { category: string }) {
  const colorMap: Record<string, string> = {
    flight: "bg-blue-500",
    hotel: "bg-purple-500",
    food: "bg-amber-500",
    activity: "bg-emerald-500",
    transit: "bg-slate-500",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colorMap[category] ?? "bg-slate-400"}`}
    />
  );
}

function LiveCompanion({
  day,
}: {
  day: { date: string; label: string; items: ItineraryItem[] };
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const upcoming = useMemo(
    () =>
      day.items
        .map((it) => {
          const [h, m] = it.time.split(":").map(Number);
          return { ...it, mins: h * 60 + m };
        })
        .filter((it) => it.mins >= nowMin)
        .sort((a, b) => a.mins - b.mins),
    [day.items, nowMin]
  );

  if (upcoming.length === 0) {
    return (
      <div className="steel angle-tr-lg mt-6 p-6">
        <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
          ● LIVE — {day.label.toUpperCase()}
        </div>
        <div className="mt-3 text-2xl font-bold tracking-tight">
          You&apos;re done for today.
        </div>
        <p className="text-[var(--muted)] mt-2">
          Nothing else on the schedule. Get some rest.
        </p>
      </div>
    );
  }

  const next = upcoming[0];
  const minutesUntil = next.mins - nowMin;
  const travelMin = next.legBefore?.minutes ?? 0;
  const leaveIn = minutesUntil - travelMin;

  return (
    <div className="steel angle-tr-lg mt-6 p-6">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 bg-[var(--accent)] pulse-dot" />
        <span className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
          LIVE — {day.label.toUpperCase()}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="text-xs text-[var(--muted)]">Up next at {next.time}</div>
          <div className="text-2xl font-bold tracking-tight mt-1">
            {next.title}
          </div>
          {next.location && (
            <div className="text-sm text-[var(--muted)] mt-1">
              {next.location.name}
            </div>
          )}
        </div>
        <div className="bg-white text-black p-4">
          <div className="text-[10px] font-bold tracking-[0.18em]">
            LEAVE IN
          </div>
          <div className="text-3xl font-bold tracking-tight mt-1">
            {leaveIn <= 0 ? "Now" : `${leaveIn} min`}
          </div>
          {travelMin > 0 && (
            <div className="text-xs text-black/60 mt-1">
              {travelMin} min travel · {next.legBefore?.mode}
            </div>
          )}
        </div>
      </div>
      {upcoming.length > 1 && (
        <div className="mt-5 pt-4 border-t border-[var(--edge)]">
          <div className="text-xs text-[var(--muted)] mb-2">
            Then today
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.slice(1, 5).map((it) => (
              <span
                key={it.id}
                className="bg-white/8 border border-[var(--edge)] px-3 py-1 text-xs"
              >
                {it.time} · {it.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupPanel({
  trip,
  currentUser,
  onAddInvitee,
  onAddExpense,
}: {
  trip: Trip;
  currentUser: string;
  onAddInvitee: () => void;
  onAddExpense: () => void;
}) {
  const totalSpend = (trip.expenses ?? []).reduce(
    (s, e) => s + e.amountUsd,
    0
  );
  const allParticipants = [
    currentUser,
    ...(trip.invitees ?? []).map((i) => i.name ?? i.email),
  ];
  const perPerson = totalSpend / Math.max(1, allParticipants.length);

  return (
    <div className="steel mt-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
            TRAVELING TOGETHER
          </div>
          <div className="text-lg font-bold mt-1">
            {allParticipants.length} traveler
            {allParticipants.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onAddInvitee} className="btn-steel px-3 py-2 text-sm">
            + Invite
          </button>
          <button onClick={onAddExpense} className="btn-steel px-3 py-2 text-sm">
            + Add expense
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="bg-white text-black px-3 py-1.5 text-sm font-medium">
          {currentUser} (you)
        </span>
        {(trip.invitees ?? []).map((i) => (
          <span
            key={i.email}
            className="bg-white/8 border border-[var(--edge)] px-3 py-1.5 text-sm"
          >
            {i.name ?? i.email}{" "}
            <span className="text-[var(--muted)] text-xs">
              ({i.status})
            </span>
          </span>
        ))}
      </div>
      {(trip.expenses ?? []).length > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--edge)]">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--muted)]">
              Total trip spend
            </div>
            <div className="text-2xl font-bold tracking-tight">
              ${totalSpend.toLocaleString()}
            </div>
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            ${perPerson.toFixed(0)} per person
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {(trip.expenses ?? []).slice(-4).map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>{e.description}</span>
                <span className="text-[var(--muted)]">
                  ${e.amountUsd} · {e.paidBy}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
