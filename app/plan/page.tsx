"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { generateItinerary, generateMultiStopItinerary } from "@/lib/mock-data";
import { getTrip, upsertTrip } from "@/lib/storage";
import {
  endDateForStops,
  makeStop,
  totalNights,
  tripStops,
} from "@/lib/trip-stops";
import { applyProfileToNewTripPreferences, loadProfile } from "@/lib/profile";
import { useRequireAuth } from "@/components/AuthProvider";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { comparePlan } from "@/lib/compare";
import ScreenshotIntel from "@/components/ScreenshotIntel";
import {
  loadPlannerDefaults,
  resetPlannerDefaults,
  savePlannerDefaults,
} from "@/lib/planner-defaults";
import {
  loadRecentDestinations,
  pushRecentDestination,
} from "@/lib/recents";
import { detectLocale } from "@/lib/locale-detect";
import CoachTour from "@/components/CoachTour";
import type {
  ItineraryDay,
  ItineraryItem,
  TransportMode,
  Trip,
  TripIntent,
  TripStop,
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

const SectionHeader = ({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) => (
  <div className="mt-7 mb-3 flex items-center gap-3">
    <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--accent)] uppercase shrink-0">
      {eyebrow}
    </span>
    <span className="text-[13px] font-semibold tracking-wide text-[var(--foreground)]">
      {title}
    </span>
    <span className="flex-1 h-px bg-[var(--border)]" />
  </div>
);

type Preset = {
  emoji: string;
  label: string;
  destination: string;
  days: number;
  intent: TripIntent;
  vibes: string[];
};

const PRESETS: Preset[] = [
  {
    emoji: "🥂",
    label: "Weekend in Lisbon",
    destination: "Lisbon",
    days: 3,
    intent: "weekend",
    vibes: ["Food", "Culture"],
  },
  {
    emoji: "🍜",
    label: "5 days in Tokyo",
    destination: "Tokyo",
    days: 5,
    intent: "foodie",
    vibes: ["Food", "Culture"],
  },
  {
    emoji: "💞",
    label: "Honeymoon in Bali",
    destination: "Bali",
    days: 7,
    intent: "honeymoon",
    vibes: ["Romantic", "Beaches"],
  },
  {
    emoji: "🏔️",
    label: "Iceland adventure",
    destination: "Reykjavík",
    days: 6,
    intent: "adventure",
    vibes: ["Nature", "Adventure"],
  },
  {
    emoji: "🎭",
    label: "Long weekend NYC",
    destination: "New York",
    days: 4,
    intent: "weekend",
    vibes: ["Culture", "Food", "Nightlife"],
  },
];

function QuickStartChips({ onPick }: { onPick: (p: Preset) => void }) {
  return (
    <div className="mt-5">
      <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2">
        // Quick start
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-full border border-[var(--border-strong)] bg-[var(--card-strong)] px-2.5 py-1.5 text-xs hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition flex items-center gap-1"
          >
            <span aria-hidden>{p.emoji}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StopsBuilder({
  stops,
  onChange,
  onCollapse,
}: {
  stops: TripStop[];
  onChange: (next: TripStop[]) => void;
  onCollapse: () => void;
}) {
  function update(id: string, patch: Partial<TripStop>) {
    onChange(stops.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function move(id: string, delta: 1 | -1) {
    const idx = stops.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = [...stops];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }
  function remove(id: string) {
    const next = stops.filter((s) => s.id !== id);
    if (next.length <= 1) {
      onCollapse();
      return;
    }
    onChange(next);
  }
  function add() {
    onChange([...stops, makeStop("", 3)]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">
          Your route ({stops.length} stops)
        </span>
        <button
          type="button"
          onClick={onCollapse}
          className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)] hover:text-white"
        >
          Single destination
        </button>
      </div>
      <ol className="space-y-2">
        {stops.map((s, i) => (
          <li
            key={s.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--accent)] uppercase shrink-0 w-6">
                {String(i + 1).padStart(2, "0")}
              </span>
              <LocationAutocomplete
                value={s.destination}
                onText={(v) => update(s.id, { destination: v })}
                onPick={(loc) =>
                  update(s.id, {
                    destination: loc.city ?? loc.name ?? loc.fullName,
                  })
                }
                placeholder={i === 0 ? "First stop…" : "Next stop…"}
              />
            </div>
            <div className="flex items-center gap-2 pl-8">
              <label className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted)]">
                Nights
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={s.nights}
                onChange={(e) =>
                  update(s.id, {
                    nights: Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                  })
                }
                className="input w-16 py-1 text-sm"
              />
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => move(s.id, -1)}
                disabled={i === 0}
                className="text-[var(--muted)] hover:text-white disabled:opacity-30 px-1"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(s.id, 1)}
                disabled={i === stops.length - 1}
                className="text-[var(--muted)] hover:text-white disabled:opacity-30 px-1"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="text-[var(--muted)] hover:text-rose-300 px-1"
                aria-label="Remove stop"
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={add}
        className="w-full rounded-xl border border-dashed border-[var(--border-strong)] py-2 text-xs text-[var(--muted)] hover:text-white hover:border-[var(--accent)] transition"
      >
        + Add another stop
      </button>
    </div>
  );
}

function RecentDestinationChips({ onPick }: { onPick: (label: string) => void }) {
  const [items, setItems] = useState<{ label: string }[]>([]);
  useEffect(() => {
    setItems(loadRecentDestinations());
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2">
        // Recent
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 6).map((d) => (
          <button
            key={d.label}
            type="button"
            onClick={() => onPick(d.label)}
            className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] hover:text-white hover:border-[var(--border-strong)]"
          >
            ← {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlanForm() {
  const { user, ready } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetDestination = searchParams.get("destination") ?? "";
  const presetDays = Number(searchParams.get("days") ?? 0);
  const presetOrigin = searchParams.get("origin") ?? "";
  const rebookId = searchParams.get("rebook");
  const rebookSource = useMemo(
    () => (rebookId ? getTrip(rebookId) : undefined),
    [rebookId]
  );

  // Per-user saved defaults — read once at mount. Rebook params override.
  const defaults = useMemo(() => loadPlannerDefaults(), []);
  const initDuration = presetDays > 0 ? presetDays : defaults.preferredDuration ?? 5;
  // Auto-detect home city on first visit when nothing's saved yet.
  const localeHome = useMemo(
    () =>
      defaults.origin || rebookSource?.origin
        ? null
        : detectLocale()?.city ?? null,
    [defaults.origin, rebookSource?.origin]
  );

  const [origin, setOrigin] = useState(
    presetOrigin ||
      rebookSource?.origin ||
      defaults.origin ||
      localeHome ||
      "New York"
  );
  const [destination, setDestination] = useState(
    rebookSource?.destination ?? presetDestination
  );
  const [startDate, setStartDate] = useState(todayISO(14));
  const [endDate, setEndDate] = useState(todayISO(14 + initDuration));
  // Multi-stop trips. Empty array = single-destination mode (just `destination`).
  // When the user hits "+ Add stop", we seed it with the current destination
  // as the first stop. From then on, stops drives endDate.
  const [stops, setStops] = useState<TripStop[]>(
    rebookSource?.stops && rebookSource.stops.length > 1 ? rebookSource.stops : []
  );
  const [travelers, setTravelers] = useState(
    rebookSource?.travelers ?? defaults.travelers ?? 2
  );
  const [vibes, setVibes] = useState<string[]>(
    rebookSource?.vibes ??
      defaults.vibes ??
      (presetDestination ? ["Food", "Culture"] : [])
  );
  const [budget, setBudget] = useState<number | "">(
    rebookSource?.budget ?? defaults.budget ?? ""
  );
  const [mode, setMode] = useState<TransportMode>(
    rebookSource?.transportMode ?? defaults.mode ?? "transit"
  );
  const [intent, setIntent] = useState<TripIntent>(
    rebookSource?.intent ?? defaults.intent ?? "vacation"
  );
  const [withKids, setWithKids] = useState(defaults.withKids ?? false);
  const [accessibility, setAccessibility] = useState(defaults.accessibility ?? false);
  const [carbonAware, setCarbonAware] = useState(defaults.carbonAware ?? false);
  const [generating, setGenerating] = useState(false);
  const [itinerary, setItinerary] = useState<ItineraryDay[] | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const isMultiStop = stops.length > 1;

  // When stops drive the schedule, derive endDate from sum of nights so the
  // user can't mismatch them. In single-destination mode the user picks both
  // dates by hand.
  useEffect(() => {
    if (!isMultiStop) return;
    setEndDate(endDateForStops(startDate, stops));
  }, [isMultiStop, startDate, stops]);

  const tripDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const ms =
      new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
  }, [startDate, endDate]);

  // Persist preferences on every meaningful change. Skips destination + dates
  // — those are per-trip, not user-level defaults.
  useEffect(() => {
    if (!ready || !user) return;
    savePlannerDefaults({
      origin,
      travelers,
      budget: typeof budget === "number" ? budget : undefined,
      intent,
      vibes,
      mode,
      withKids,
      accessibility,
      carbonAware,
      preferredDuration: tripDays,
    });
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 1200);
    return () => clearTimeout(t);
  }, [
    ready,
    user,
    origin,
    travelers,
    budget,
    intent,
    vibes,
    mode,
    withKids,
    accessibility,
    carbonAware,
    tripDays,
  ]);

  function handleResetDefaults() {
    resetPlannerDefaults();
    setOrigin("New York");
    setTravelers(2);
    setBudget("");
    setIntent("vacation");
    setVibes([]);
    setMode("transit");
    setWithKids(false);
    setAccessibility(false);
    setCarbonAware(false);
  }

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
    const days = isMultiStop
      ? generateMultiStopItinerary(stops, startDate, mode)
      : generateItinerary(destination, startDate, endDate, mode);
    setItinerary(days);
    setGenerating(false);
  }

  function handleSave() {
    if (!itinerary || !destination) return;
    pushRecentDestination(destination);
    if (isMultiStop) {
      for (const s of stops) pushRecentDestination(s.destination);
    }
    const profile = loadProfile();
    const trip: Trip = {
      id: `trip-${Date.now()}`,
      destination: isMultiStop ? stops[0].destination : destination,
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
      stops: isMultiStop ? stops : undefined,
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
      <CoachTour />
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
        <aside className="steel p-6 h-fit lg:sticky lg:top-24">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Plan a trip
              </h2>
              <p className="text-sm text-[var(--muted)] mt-1">
                Tell us a few things. We&apos;ll do the rest.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em]">
              <span
                className={`inline-flex items-center gap-1.5 transition ${
                  savedFlash
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted)]"
                }`}
                aria-live="polite"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                {savedFlash ? "Saved" : "Auto-save"}
              </span>
            </div>
          </div>

          <QuickStartChips
            onPick={(p) => {
              setDestination(p.destination);
              setIntent(p.intent);
              setVibes(p.vibes);
              setStartDate(todayISO(14));
              setEndDate(todayISO(14 + p.days));
            }}
          />

          <RecentDestinationChips onPick={setDestination} />

          <SectionHeader eyebrow="// 01" title="Where & when" />

          <div className="space-y-4">
            {!isMultiStop && (
              <Field label="Where do you want to go?">
                <LocationAutocomplete
                  value={destination}
                  onText={setDestination}
                  onPick={(loc) =>
                    setDestination(loc.city ?? loc.name ?? loc.fullName)
                  }
                  placeholder="Tokyo, Lisbon, Mexico City, LAX, an address…"
                />
                <button
                  type="button"
                  onClick={() => {
                    // Promote current destination to first stop, add a blank
                    // second stop so the user can fill it in.
                    const initial = destination?.trim() || "";
                    const seedNights = Math.max(
                      1,
                      Math.round(tripDays / 2) || 3
                    );
                    setStops([
                      makeStop(initial || "First stop", seedNights),
                      makeStop("", seedNights),
                    ]);
                  }}
                  className="mt-2 text-xs text-[var(--accent)] hover:underline"
                >
                  + Add a second stop
                </button>
              </Field>
            )}

            {isMultiStop && (
              <StopsBuilder
                stops={stops}
                onChange={(next) => {
                  setStops(next);
                  if (next[0]?.destination) setDestination(next[0].destination);
                }}
                onCollapse={() => {
                  // Convert back to single-destination mode using the first stop.
                  const first = stops[0];
                  setStops([]);
                  setDestination(first?.destination ?? destination);
                }}
              />
            )}
            <Field label="Starting from">
              <LocationAutocomplete
                value={origin}
                onText={setOrigin}
                onPick={(loc) =>
                  setOrigin(loc.iata ?? loc.city ?? loc.name ?? loc.fullName)
                }
                placeholder="New York, JFK, your home address…"
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
              {isMultiStop ? (
                <Field
                  label="Coming home"
                  hint={`${totalNights(stops)} nights`}
                >
                  <input
                    type="date"
                    value={endDate}
                    readOnly
                    className="input opacity-70 cursor-not-allowed"
                  />
                </Field>
              ) : (
                <Field label="Coming home">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input"
                  />
                </Field>
              )}
            </div>
          </div>

          <SectionHeader eyebrow="// 02" title="Who's going & vibe" />

          <div className="space-y-4">
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
          </div>

          <SectionHeader eyebrow="// 03" title="How you travel" />

          <div className="space-y-4">
            <Field label="Get around with">
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

          {(() => {
            const missing = !destination
              ? "Pick a destination to continue"
              : !startDate || !endDate
              ? "Pick your dates"
              : tripDays > 30
              ? "Trips longer than 30 days aren't supported yet"
              : null;
            return (
              <>
                <button
                  onClick={handleGenerate}
                  disabled={!!missing || generating}
                  className="btn-primary mt-7 w-full py-3 text-base disabled:opacity-50"
                >
                  {generating ? "Building your trip…" : "Build my trip"}
                </button>
                {missing && (
                  <div className="mt-2 text-xs text-amber-300/90 text-center">
                    {missing}
                  </div>
                )}
              </>
            );
          })()}

          <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-[var(--muted)] uppercase tracking-[0.16em]">
            <button
              onClick={() =>
                window.dispatchEvent(new Event("voyage:replay-tour"))
              }
              className="hover:text-white underline-offset-2 hover:underline"
            >
              Replay tour
            </button>
            <button
              onClick={handleResetDefaults}
              className="hover:text-white underline-offset-2 hover:underline"
            >
              Reset prefs
            </button>
          </div>
        </aside>

        <section>
          <div className="mb-6">
            <ScreenshotIntel
              context={`Planning a ${tripDays}-day trip to ${
                isMultiStop
                  ? stops.map((s) => s.destination).join(" → ")
                  : destination || "(unset)"
              } from ${origin}, starting ${startDate}, ${travelers} traveler${
                travelers === 1 ? "" : "s"
              }, vibes: ${vibes.join(", ") || "none"}.`}
              compact
              onApply={(s) => {
                const p = s.payload as
                  | { destination?: string; nights?: number }
                  | undefined;
                if (s.kind === "add-stop" && p?.destination) {
                  const seedNights = Math.max(1, Number(p.nights) || 3);
                  setStops((prev) =>
                    prev.length > 0
                      ? [...prev, makeStop(p.destination!, seedNights)]
                      : [
                          makeStop(destination || "First stop", tripDays || 3),
                          makeStop(p.destination!, seedNights),
                        ]
                  );
                }
              }}
            />
          </div>
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
