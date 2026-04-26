"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { generateItinerary } from "@/lib/mock-data";
import { getTrip, upsertTrip } from "@/lib/storage";
import { applyProfileToNewTripPreferences, loadProfile } from "@/lib/profile";
import { useRequireAuth } from "@/components/AuthProvider";
import { comparePlan } from "@/lib/compare";
import type {
  ItineraryDay,
  ItineraryItem,
  TransportMode,
  Trip,
  TripIntent,
} from "@/lib/types";

const VIBE_OPTIONS = [
  "Food",
  "Culture",
  "Nature",
  "Nightlife",
  "Beaches",
  "Adventure",
  "Family",
  "Romantic",
  "Budget",
  "Luxury",
];

const INTENT_OPTIONS: { id: TripIntent; label: string; emoji: string }[] = [
  { id: "vacation", label: "Vacation", emoji: "🏖️" },
  { id: "weekend", label: "Weekend", emoji: "🥂" },
  { id: "work", label: "Work", emoji: "💼" },
  { id: "family", label: "Family", emoji: "👨‍👩‍👧" },
  { id: "honeymoon", label: "Honeymoon", emoji: "💞" },
  { id: "adventure", label: "Adventure", emoji: "🏔️" },
  { id: "wellness", label: "Wellness", emoji: "🧘" },
  { id: "foodie", label: "Foodie", emoji: "🍜" },
];

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function PlanToggle({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between border px-4 py-2.5 text-sm font-medium transition ${
        value
          ? "bg-white text-black border-white"
          : "btn-steel"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
      </span>
      <span className={`text-xs ${value ? "text-black/60" : "text-[var(--muted)]"}`}>
        {value ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function PlanForm() {
  const { user, ready } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetDestination = searchParams.get("destination") ?? "";
  const presetDays = Number(searchParams.get("days") ?? 0);
  const rebookId = searchParams.get("rebook");
  const rebookSource = useMemo(
    () => (rebookId ? getTrip(rebookId) : undefined),
    [rebookId]
  );

  const [origin, setOrigin] = useState(rebookSource?.origin ?? "New York");
  const [destination, setDestination] = useState(
    rebookSource?.destination ?? presetDestination
  );
  const [startDate, setStartDate] = useState(todayISO(14));
  const [endDate, setEndDate] = useState(
    todayISO(14 + (presetDays > 0 ? presetDays : 5))
  );
  const [travelers, setTravelers] = useState(rebookSource?.travelers ?? 2);
  const [vibes, setVibes] = useState<string[]>(
    rebookSource?.vibes ??
      (presetDestination ? ["Food", "Culture"] : [])
  );
  const [budget, setBudget] = useState<number | "">(rebookSource?.budget ?? "");
  const [mode, setMode] = useState<TransportMode>(
    rebookSource?.transportMode ?? "transit"
  );
  const [intent, setIntent] = useState<TripIntent>(
    rebookSource?.intent ?? "vacation"
  );
  const [withKids, setWithKids] = useState(false);
  const [accessibility, setAccessibility] = useState(false);
  const [carbonAware, setCarbonAware] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [itinerary, setItinerary] = useState<ItineraryDay[] | null>(null);

  const tripDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const ms =
      new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
  }, [startDate, endDate]);

  useEffect(() => {
    if (presetDestination && !itinerary) {
      // auto-trigger generation when arriving from a preset
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    if (!destination || !startDate || !endDate) return;
    setGenerating(true);
    setItinerary(null);
    // Simulate AI thinking
    await new Promise((r) => setTimeout(r, 700));
    const days = generateItinerary(destination, startDate, endDate, mode);
    setItinerary(days);
    setGenerating(false);
  }

  function handleSave() {
    if (!itinerary || !destination) return;
    const profile = loadProfile();
    const trip: Trip = {
      id: `trip-${Date.now()}`,
      destination,
      origin,
      startDate,
      endDate,
      travelers,
      budget: typeof budget === "number" ? budget : undefined,
      vibes,
      intent,
      withKids,
      accessibility,
      carbonAware,
      itinerary,
      transportMode: mode,
      preferences: applyProfileToNewTripPreferences(profile),
      createdAt: new Date().toISOString(),
    };
    upsertTrip(trip);
    router.push(`/trips/${trip.id}`);
  }

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
        <aside className="steel p-6 h-fit lg:sticky lg:top-24">
          <h2 className="text-2xl font-bold tracking-tight">
            Plan a trip
          </h2>
          <p className="text-sm text-[var(--muted)] mt-2">
            Tell us a few things. We&apos;ll do the rest.
          </p>

          <div className="mt-6 space-y-5">
            <Field label="Where do you want to go?">
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Tokyo, Lisbon, Mexico City…"
                className="input"
              />
            </Field>
            <Field label="Where are you starting from?">
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="New York"
                className="input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Leaving">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Coming home">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Travelers">
                <input
                  type="number"
                  min={1}
                  value={travelers}
                  onChange={(e) =>
                    setTravelers(Math.max(1, Number(e.target.value)))
                  }
                  className="input"
                />
              </Field>
              <Field label="Budget" hint="optional">
                <input
                  type="number"
                  min={0}
                  placeholder="$"
                  value={budget}
                  onChange={(e) =>
                    setBudget(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  className="input"
                />
              </Field>
            </div>
            <Field label="What kind of trip?">
              <div className="flex flex-wrap gap-2">
                {INTENT_OPTIONS.map((opt) => {
                  const active = intent === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setIntent(opt.id)}
                      className={`border px-3 py-2 text-sm font-medium transition flex items-center gap-1.5 ${
                        active
                          ? "bg-white text-black border-white"
                          : "btn-steel"
                      }`}
                    >
                      <span aria-hidden>{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="What are you into?" hint="pick a few">
              <div className="flex flex-wrap gap-2">
                {VIBE_OPTIONS.map((v) => {
                  const active = vibes.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        setVibes((prev) =>
                          prev.includes(v)
                            ? prev.filter((x) => x !== v)
                            : [...prev, v]
                        )
                      }
                      className={`border px-3 py-1.5 text-sm font-medium transition ${
                        active
                          ? "bg-white text-black border-white"
                          : "btn-steel"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="How will you get around?">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "walk", label: "Walk", icon: "🚶" },
                    { id: "transit", label: "Transit", icon: "🚇" },
                    { id: "drive", label: "Drive", icon: "🚗" },
                  ] as const
                ).map((opt) => {
                  const active = mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMode(opt.id)}
                      className={`border px-3 py-2.5 text-sm font-medium transition flex items-center justify-center gap-1.5 ${
                        active
                          ? "bg-white text-black border-white"
                          : "btn-steel"
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          <div className="mt-5 space-y-2.5">
            <PlanToggle
              label="Traveling with kids"
              icon="👶"
              value={withKids}
              onChange={setWithKids}
            />
            <PlanToggle
              label="Accessibility-friendly"
              icon="♿"
              value={accessibility}
              onChange={setAccessibility}
            />
            <PlanToggle
              label="Show carbon footprint"
              icon="🌱"
              value={carbonAware}
              onChange={setCarbonAware}
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={!destination || generating}
            className="btn-primary mt-7 w-full py-3 text-base disabled:opacity-50"
          >
            {generating ? "Building your trip…" : "Build my trip"}
          </button>
        </aside>

        <section>
          {!itinerary && !generating && (
            <EmptyState destination={destination} />
          )}
          {generating && <GeneratingState />}
          {itinerary && (
            <ResultView
              destination={destination}
              origin={origin}
              startDate={startDate}
              travelers={travelers}
              days={itinerary}
              tripDays={tripDays}
              onSave={handleSave}
              onRegenerate={handleGenerate}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-[var(--foreground)]">
          {label}
        </span>
        {hint && (
          <span className="text-xs text-[var(--muted)]">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function EmptyState({ destination }: { destination: string }) {
  return (
    <div className="steel p-12 text-center">
      <div className="text-6xl mb-5">🗺️</div>
      <h3 className="text-2xl font-bold tracking-tight">
        {destination
          ? `Let's plan ${destination}.`
          : "Where are we going?"}
      </h3>
      <p className="text-[var(--muted)] mt-3 max-w-md mx-auto">
        Fill in your trip details on the left. We&apos;ll plan your whole
        trip in a few seconds — flights, hotels, and a daily schedule.
      </p>
    </div>
  );
}

function GeneratingState() {
  return (
    <div className="steel p-14 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center border-2 border-white border-t-transparent animate-spin mb-5" />
      <h3 className="text-2xl font-bold tracking-tight">
        Building your trip…
      </h3>
      <p className="text-[var(--muted)] mt-3">
        Picking neighborhoods, restaurants, and timing.
      </p>
    </div>
  );
}

function ResultView({
  destination,
  origin,
  startDate,
  travelers,
  days,
  tripDays,
  onSave,
  onRegenerate,
}: {
  destination: string;
  origin: string;
  startDate: string;
  travelers: number;
  days: ItineraryDay[];
  tripDays: number;
  onSave: () => void;
  onRegenerate: () => void;
}) {
  const compare = useMemo(
    () =>
      comparePlan({
        origin,
        destination,
        date: startDate,
        travelers,
        nights: tripDays - 1,
        international: /,|\b(France|Japan|Italy|Spain|UK|Mexico|Iceland|Morocco|Argentina|Portugal|Germany|Netherlands)\b/i.test(
          destination
        ),
      }),
    [origin, destination, startDate, travelers, tripDays]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-[var(--muted)]">
            Your trip plan · {origin} → {destination}
          </div>
          <h2 className="text-4xl font-bold tracking-tight mt-1">
            {destination}
          </h2>
          <p className="text-[var(--muted)] mt-1.5">
            {tripDays} day{tripDays === 1 ? "" : "s"} ·{" "}
            {days.reduce((sum, d) => sum + d.items.length, 0)} stops
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRegenerate}
            className="btn-steel px-4 py-2.5 text-sm"
          >
            Try another plan
          </button>
          <button
            onClick={onSave}
            className="btn-primary px-5 py-2.5 text-sm"
          >
            Save trip
          </button>
        </div>
      </div>

      <CompareCard
        origin={origin}
        destination={destination}
        compare={compare}
        travelers={travelers}
      />

      <div className="space-y-4">
        {days.map((day, idx) => (
          <DayCard key={day.date} day={day} index={idx} />
        ))}
      </div>
    </div>
  );
}

function CompareCard({
  origin,
  destination,
  compare,
  travelers,
}: {
  origin: string;
  destination: string;
  compare: ReturnType<typeof comparePlan>;
  travelers: number;
}) {
  const flyHours = Math.floor(compare.fly.minutes / 60);
  const flyMins = compare.fly.minutes % 60;
  const flyTimeLabel = `${flyHours}h ${flyMins}m`;
  const driveTimeLabel =
    compare.drive.hours < 24
      ? `${compare.drive.hours}h`
      : `${(compare.drive.hours / 24).toFixed(1)} days`;

  return (
    <div className="steel p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xl font-bold tracking-tight">
            Drive or fly?
          </div>
          <div className="text-sm text-[var(--muted)] mt-1">
            {origin} → {destination} · {compare.drive.miles.toLocaleString()} mi
          </div>
        </div>
        <div className="text-sm font-medium">
          {compare.cheaperBy === "tie" ? (
            <span className="text-[var(--muted)]">Cost is about equal</span>
          ) : (
            <span>
              <span className="text-white">
                {compare.cheaperBy === "drive" ? "Driving" : "Flying"}
              </span>{" "}
              <span className="text-[var(--muted)]">
                saves you ${compare.savingsUsd}
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <ModeBlock
          mode="drive"
          label="Drive"
          icon="🚗"
          time={driveTimeLabel}
          subtitle={
            compare.drive.overnightStops > 0
              ? `${compare.drive.overnightStops} overnight stop${compare.drive.overnightStops === 1 ? "" : "s"}`
              : "Direct"
          }
          breakdown={[
            ["Gas", `$${compare.drive.gasUsd}`],
            ["Tolls", `$${compare.drive.tollsUsd}`],
            ...(compare.drive.lodgingUsd > 0
              ? ([["Lodging en route", `$${compare.drive.lodgingUsd}`]] as [
                  string,
                  string,
                ][])
              : []),
            ["Parking", `$${compare.drive.parkingUsd}`],
          ]}
          total={compare.drive.totalUsd}
          best={compare.cheaperBy === "drive"}
        />
        <ModeBlock
          mode="fly"
          label="Fly"
          icon="✈️"
          time={flyTimeLabel}
          subtitle="Cheapest fare"
          breakdown={[
            [
              `Fare × ${travelers}`,
              `$${compare.fly.cheapestFareUsd * travelers}`,
            ],
            ["Bags", `$${compare.fly.baggageUsd}`],
            ["Transfers", `$${compare.fly.transfersUsd}`],
            ["Resort fees", `$${compare.fly.resortFeesUsd}`],
            ...(compare.fly.fxUsd > 0
              ? ([[`FX fees (2.5%)`, `$${compare.fly.fxUsd}`]] as [
                  string,
                  string,
                ][])
              : []),
          ]}
          total={compare.fly.totalUsd}
          best={compare.cheaperBy === "fly"}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--edge)] grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-[var(--muted)]">Carbon</div>
          <div className="mt-1">
            🌱 Driving: <strong>{compare.drive.co2Kg.toLocaleString()} kg</strong>
            <span className="text-[var(--muted)]"> · Flying: </span>
            <strong>{compare.fly.co2Kg.toLocaleString()} kg</strong>
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {compare.greenerBy === "drive" ? "Driving" : "Flying"} is greener.
            Offset: ~${compare.carbonOffsetUsd}.
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">Time</div>
          <div className="mt-1">
            {compare.fasterBy === "fly" ? "Flying" : "Driving"} is faster
            door-to-door.
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">All-in cost</div>
          <div className="mt-1">
            Difference: <strong>${compare.savingsUsd}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeBlock({
  label,
  icon,
  time,
  subtitle,
  breakdown,
  total,
  best,
}: {
  mode: "drive" | "fly";
  label: string;
  icon: string;
  time: string;
  subtitle: string;
  breakdown: [string, string][];
  total: number;
  best: boolean;
}) {
  return (
    <div
      className={`p-5 transition border ${
        best
          ? "bg-white text-black border-white"
          : "bg-black/40 border-[var(--edge)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{icon}</span>
          <div>
            <div className="font-bold text-lg leading-tight">{label}</div>
            <div className={`text-xs ${best ? "text-black/60" : "text-[var(--muted)]"}`}>
              {subtitle}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium">{time}</div>
          {best && (
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase mt-0.5">
              Cheapest
            </div>
          )}
        </div>
      </div>
      <div className={`mt-4 space-y-1.5 text-xs ${best ? "text-black/70" : "text-[var(--muted)]"}`}>
        {breakdown.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div className={`mt-4 pt-4 border-t flex items-baseline justify-between ${best ? "border-black/15" : "border-[var(--edge)]"}`}>
        <span className={`text-sm ${best ? "text-black/60" : "text-[var(--muted)]"}`}>
          Total
        </span>
        <span className="text-3xl font-bold tracking-tight">
          ${total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function DayCard({ day, index }: { day: ItineraryDay; index: number }) {
  const totalTravel = day.items.reduce(
    (sum, it) => sum + (it.legBefore?.minutes ?? 0),
    0
  );
  return (
    <div className="steel overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--edge)] flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
            Day {index + 1}
          </div>
          <div className="font-bold text-lg">{day.label}</div>
        </div>
        <div className="text-right text-sm text-[var(--muted)]">
          <div>{day.items.length} stops</div>
          {totalTravel > 0 && (
            <div className="text-xs">~{totalTravel} min traveling</div>
          )}
        </div>
      </div>
      <ol>
        {day.items.map((it, i) => (
          <li key={it.id}>
            {it.legBefore && (
              <LegRow item={it} />
            )}
            <div
              className={`flex gap-4 px-6 py-4 ${i > 0 && !it.legBefore ? "border-t border-[var(--border)]" : ""}`}
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
                <p className="text-sm text-[var(--muted)] mt-1">
                  {it.description}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

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

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-[var(--muted)]">Loading…</div>}>
      <PlanForm />
    </Suspense>
  );
}
