"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  ExternalLink,
  Mic,
  Moon,
  Plane,
  PlaneTakeoff,
  Square,
  Sun,
  Ticket,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { loadConfirmations } from "@/lib/wallet";
import { mockFlightStatus } from "@/lib/disruptions";
import { buildJetLagPlan } from "@/lib/jetlag";
import { discoverEvents } from "@/lib/events";
import { addCommitment } from "@/lib/commitments";
import {
  createRecognition,
  interpretCommand,
  speechRecognitionAvailable,
  type VoiceCommand,
} from "@/lib/voice";
import {
  loadWatch,
  summarizeWatch,
  toggleWatch,
} from "@/lib/price-watch";
import type { Confirmation } from "@/lib/wallet";
import type { LocalEvent, Trip } from "@/lib/types";

// ============================================================================
// Airport companion mode — surfaces when within 4h of a flight
// ============================================================================

export function AirportCompanion({ trip }: { trip: Trip }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const wallet = loadConfirmations();
  const flights = wallet.filter(
    (w) =>
      w.type === "flight" &&
      (w.tripId === trip.id || (w.date >= trip.startDate && w.date <= trip.endDate))
  );
  const now = Date.now();
  const upcoming = flights
    .map((f) => {
      const dt = new Date(`${f.date}T${(f.time ?? "12:00")}:00`).getTime();
      return { f, dt, distance: dt - now };
    })
    .filter((x) => x.distance > -2 * 60 * 60 * 1000) // within last 2h still relevant
    .sort((a, b) => a.distance - b.distance)[0];

  if (!upcoming) return null;
  const hoursAway = upcoming.distance / (60 * 60 * 1000);
  if (hoursAway > 4) return null;

  const snap = mockFlightStatus(upcoming.f);
  const minsToBoard = Math.max(0, Math.round(upcoming.distance / 60000) - 30);
  const minsToDeparture = Math.round(upcoming.distance / 60000);

  return (
    <div className="steel mt-6 p-5 border-l-2 border-l-[var(--accent)]">
      <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[var(--accent)] uppercase">
        <PlaneTakeoff size={14} strokeWidth={1.75} aria-hidden />
        <span>Airport mode</span>
        <span className="ml-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-[var(--muted)]">Flight</div>
          <div className="text-xl font-bold tracking-tight mt-1">
            {upcoming.f.vendor} · {upcoming.f.from ?? "—"} → {upcoming.f.to ?? "—"}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {upcoming.f.reference}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">Boarding in</div>
          <div className="text-3xl font-bold tracking-tight mt-1 font-mono">
            {minsToBoard <= 0
              ? "Now"
              : `${Math.floor(minsToBoard / 60)}h ${minsToBoard % 60}m`}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            Departs in {Math.floor(minsToDeparture / 60)}h {minsToDeparture % 60}m
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)]">Gate / Terminal</div>
          <div className="text-3xl font-bold tracking-tight mt-1 font-mono">
            {snap.gate ?? "—"}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            Terminal {snap.terminal ?? "—"} · {snap.message}
          </div>
        </div>
      </div>
      <div className="mt-4 text-xs text-[var(--muted)]">
        Allow ~10 min walk to most gates. Lounges + food open until ~30 min before
        departure.
      </div>
    </div>
  );
}

// ============================================================================
// Jet lag plan
// ============================================================================

export function JetLagCard({
  trip,
  storageKey,
}: {
  trip: Trip;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    if (window.localStorage.getItem(storageKey) === "1") setOpen(true);
  }, [storageKey]);
  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }
  const plan = useMemo(() => buildJetLagPlan(trip), [trip]);
  if (!plan) return null;

  return (
    <div className="steel mt-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <Moon
            size={18}
            strokeWidth={1.75}
            className="text-[var(--accent)] flex-none"
            aria-hidden
          />
          <div className="text-left">
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
              JET LAG PLAN
            </div>
            <div className="text-sm mt-0.5">
              {plan.deltaHours > 0 ? "+" : ""}
              {plan.deltaHours}h · shift {plan.direction === "east" ? "earlier" : "later"} over 3 days
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} strokeWidth={1.75} aria-hidden />
        ) : (
          <ChevronDown size={18} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--edge)] divide-y divide-[var(--edge)]">
          {plan.days.map((d) => (
            <div key={d.dayOffset} className="px-6 py-3 flex items-start gap-3">
              <div className="w-16 flex-none text-xs font-mono text-[var(--muted)]">
                {d.dayOffset === 0
                  ? "Arrival"
                  : d.dayOffset > 0
                    ? `+${d.dayOffset}`
                    : d.dayOffset}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <Moon size={11} strokeWidth={1.75} className="inline mr-1" aria-hidden />
                  Sleep {d.bedtimeLocal} · wake {d.wakeTimeLocal}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    <Coffee size={10} strokeWidth={1.75} className="inline mr-1" aria-hidden />
                    Caffeine cutoff {d.caffeineCutoff}
                  </span>
                  <span>
                    <Sun size={10} strokeWidth={1.75} className="inline mr-1" aria-hidden />
                    Light {d.lightExposure.start}–{d.lightExposure.end} ({d.lightExposure.type})
                  </span>
                  {d.melatonin && <span>{d.melatonin}</span>}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1 italic">
                  {d.notes}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Smart departure checklist (auto-shows ~24h before first flight)
// ============================================================================

const DEPARTURE_CHECK_KEY = "voyage:departure-check";

function checkKey(tripId: string) {
  return `${DEPARTURE_CHECK_KEY}:${tripId}`;
}

export function DepartureChecklist({ trip }: { trip: Trip }) {
  const wallet = loadConfirmations();
  const firstFlight = wallet
    .filter(
      (w) =>
        w.type === "flight" &&
        (w.tripId === trip.id || (w.date >= trip.startDate && w.date <= trip.endDate))
    )
    .sort((a, b) =>
      `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`)
    )[0];

  const items = useMemo(() => buildChecklist(trip, firstFlight), [trip, firstFlight]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setChecks(JSON.parse(window.localStorage.getItem(checkKey(trip.id)) ?? "{}"));
    } catch {
      setChecks({});
    }
  }, [trip.id]);

  function toggle(id: string) {
    const next = { ...checks, [id]: !checks[id] };
    setChecks(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(checkKey(trip.id), JSON.stringify(next));
    }
  }

  if (!firstFlight) return null;

  const dep = new Date(`${firstFlight.date}T${firstFlight.time ?? "12:00"}:00`).getTime();
  const hoursAway = (dep - Date.now()) / (60 * 60 * 1000);
  // Show within 36h before through 2h after departure.
  if (hoursAway > 36 || hoursAway < -2) return null;

  const completed = items.filter((it) => checks[it.id]).length;

  return (
    <div className="steel mt-6 p-5 border-l-2 border-l-[var(--accent)]">
      <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[var(--accent)] uppercase">
        <CheckSquare size={14} strokeWidth={1.75} aria-hidden />
        <span>DEPARTURE CHECKLIST</span>
        <span className="ml-auto text-[var(--muted)] font-normal">
          {completed}/{items.length}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-3 group">
            <button
              type="button"
              onClick={() => toggle(it.id)}
              className="mt-0.5 flex-none text-[var(--muted)] hover:text-[var(--foreground)]"
              aria-pressed={checks[it.id] ?? false}
              aria-label={it.label}
            >
              {checks[it.id] ? (
                <CheckCircle2 size={16} strokeWidth={1.75} className="text-[var(--accent)]" aria-hidden />
              ) : (
                <Square size={16} strokeWidth={1.75} aria-hidden />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${checks[it.id] ? "line-through text-[var(--muted)]" : ""}`}>
                {it.label}
              </div>
              {it.detail && (
                <div className="text-xs text-[var(--muted)] mt-0.5">
                  {it.detail}
                  {it.href && (
                    <>
                      {" — "}
                      <a
                        href={it.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] hover:underline"
                      >
                        Open
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildChecklist(
  trip: Trip,
  firstFlight: Confirmation | undefined
): { id: string; label: string; detail?: string; href?: string }[] {
  const list: { id: string; label: string; detail?: string; href?: string }[] = [];
  if (firstFlight) {
    list.push({
      id: "checkin",
      label: `Check in for ${firstFlight.vendor} ${firstFlight.reference}`,
      detail: "Online check-in opens 24 hours before departure.",
    });
    list.push({
      id: "boarding-pass",
      label: "Save boarding pass to wallet",
      detail: "Apple/Google Wallet pass works offline.",
    });
    list.push({
      id: "leave-time",
      label: `Leave for the airport`,
      detail: `Aim to be at security ~90 min before ${firstFlight.time ?? "departure"}.`,
    });
  }
  list.push({
    id: "passport",
    label: "Pack passport + 1 backup ID",
    detail: trip.preferences?.insurance?.policyNumber
      ? "Travel insurance card too."
      : undefined,
  });
  list.push({
    id: "adapter",
    label: "Charge phone + battery + adapter",
  });
  list.push({
    id: "offline-maps",
    label: "Download offline maps",
    detail: "Use Google Maps offline area for the city you're visiting.",
    href: "https://www.google.com/maps",
  });
  list.push({
    id: "hotel",
    label: "Confirm hotel reservation",
    detail: "Save the address for the cab driver — not all hotels show on Apple Maps.",
  });
  list.push({
    id: "currency",
    label: "Get a small amount of local currency",
    detail: "$50–100 USD equivalent for taxi / SIM kiosk on arrival.",
  });
  return list;
}

// ============================================================================
// Local events list
// ============================================================================

const EVT_DISMISSED_KEY = "voyage:dismissed-events";

export function EventsCard({ trip, storageKey }: { trip: Trip; storageKey?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    if (window.localStorage.getItem(storageKey) === "1") setOpen(true);
  }, [storageKey]);
  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  const events = useMemo(() => discoverEvents(trip), [trip]);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setDismissed(JSON.parse(window.localStorage.getItem(EVT_DISMISSED_KEY) ?? "{}"));
    } catch {
      // ignore
    }
  }, []);

  function dismiss(id: string) {
    const next = { ...dismissed, [id]: true };
    setDismissed(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EVT_DISMISSED_KEY, JSON.stringify(next));
    }
  }

  function addToTrip(e: LocalEvent) {
    addCommitment({
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tripId: trip.id,
      title: e.title,
      address: e.venue,
      date: e.date,
      startTime: e.startTime,
      priority: "flexible",
      notes: e.blurb,
      createdAt: new Date().toISOString(),
    });
    dismiss(e.id);
  }

  const visible = events.filter((e) => !dismissed[e.id]);
  if (events.length === 0) return null;

  return (
    <div className="steel mt-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <Ticket
            size={18}
            strokeWidth={1.75}
            className="text-[var(--accent)] flex-none"
            aria-hidden
          />
          <div className="text-left">
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
              EVENTS DURING YOUR TRIP
            </div>
            <div className="text-sm mt-0.5">
              {visible.length} event{visible.length === 1 ? "" : "s"} matched to your dates
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} strokeWidth={1.75} aria-hidden />
        ) : (
          <ChevronDown size={18} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--edge)] divide-y divide-[var(--edge)]">
          {visible.map((e) => (
            <div key={e.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    {e.category}
                  </div>
                  <div className="font-medium mt-0.5">{e.title}</div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {new Date(e.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {e.startTime ? ` · ${e.startTime}` : ""} · {e.venue}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">{e.blurb}</div>
                </div>
                <div className="flex gap-2 flex-none">
                  <button
                    onClick={() => addToTrip(e)}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    Add to itinerary
                  </button>
                  <button
                    onClick={() => dismiss(e.id)}
                    className="btn-steel px-3 py-1.5 text-xs"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Voice command floating button
// ============================================================================

export function VoiceCommandButton({ trip }: { trip: Trip }) {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const handleRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    setSupported(speechRecognitionAvailable());
  }, []);

  function execute(cmd: VoiceCommand) {
    switch (cmd.kind) {
      case "next-item":
        setFeedback("Showing what's next on your itinerary…");
        document
          .querySelector<HTMLElement>("[data-day-by-day]")
          ?.scrollIntoView({ behavior: "smooth" });
        break;
      case "spending":
        setFeedback("Opening the spending dashboard…");
        router.push("/wallet?view=spending");
        break;
      case "navigate":
        setFeedback(`Searching directions to “${cmd.query}”…`);
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cmd.query)}`,
          "_blank"
        );
        break;
      case "add-restaurant":
        setFeedback(`Open Add Commitment with “${cmd.query ?? "restaurant"}” pre-filled.`);
        document.querySelector<HTMLElement>("[data-add-commitment]")?.click();
        break;
      case "add-activity":
        setFeedback(`Open Add Commitment with “${cmd.query ?? "activity"}” pre-filled.`);
        document.querySelector<HTMLElement>("[data-add-commitment]")?.click();
        break;
      case "show-tickets":
        setFeedback("Opening your wallet…");
        router.push("/wallet");
        break;
      case "show-itinerary":
        setFeedback("Scrolling to your day-by-day plan…");
        document
          .querySelector<HTMLElement>("[data-day-by-day]")
          ?.scrollIntoView({ behavior: "smooth" });
        break;
      case "show-flights":
        setFeedback("Opening flights…");
        router.push("/flights");
        break;
      case "show-hotel":
        setFeedback("Opening hotels…");
        router.push("/hotels");
        break;
      default:
        setFeedback("Sorry — didn't catch that.");
    }
  }

  function startListening() {
    setTranscript("");
    setFeedback(null);
    handleRef.current = createRecognition({
      onResult: (t, isFinal) => {
        setTranscript(t);
        if (isFinal) {
          const cmd = interpretCommand(t);
          execute(cmd);
        }
      },
      onError: () => {
        setFeedback("Microphone error.");
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
    if (!handleRef.current) {
      setFeedback("Speech recognition isn't supported in this browser.");
      return;
    }
    setListening(true);
    handleRef.current.start();
  }

  function stopListening() {
    handleRef.current?.stop();
    setListening(false);
  }

  void trip;

  return (
    <>
      <button
        type="button"
        onClick={listening ? stopListening : startListening}
        disabled={!supported}
        className={`fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full flex items-center justify-center shadow-2xl transition ${
          listening
            ? "bg-[var(--accent)] text-black animate-pulse"
            : supported
              ? "bg-[var(--background-soft)] border border-[var(--border-strong)] text-[var(--foreground)] hover:border-[var(--accent)]"
              : "bg-[var(--background-soft)] border border-[var(--border)] text-[var(--muted)] cursor-not-allowed"
        }`}
        title={
          supported
            ? listening
              ? "Stop listening"
              : "Try: 'what's next', 'navigate to dinner', 'how much have I spent'"
            : "Voice commands need Chrome or Safari"
        }
        aria-label="Voice commands"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Mic size={20} strokeWidth={1.75} aria-hidden />
      </button>

      {(transcript || feedback) && (
        <div
          className="fixed bottom-24 right-6 z-40 max-w-xs steel p-3 rounded-xl shadow-2xl"
          role="status"
        >
          {transcript && (
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider">
              Heard
            </div>
          )}
          {transcript && (
            <div className="text-sm font-medium mt-1">“{transcript}”</div>
          )}
          {feedback && (
            <div className="text-xs text-[var(--accent)] mt-2">{feedback}</div>
          )}
        </div>
      )}
    </>
  );
}

// ============================================================================
// Price-watch toggle + sparkline (used by ConfirmationCard)
// ============================================================================

export function PriceWatchToggle({ c }: { c: Confirmation }) {
  const [watch, setWatchState] = useState(() => loadWatch(c.id));

  function flip() {
    const next = toggleWatch(c, !(watch?.enabled ?? false));
    setWatchState(next);
  }
  if (c.totalUsd == null) return null;
  const summary = watch ? summarizeWatch(watch.history) : null;

  return (
    <div className="mt-3 border border-[var(--border)] rounded-md px-3 py-2 flex items-center gap-3">
      <button
        type="button"
        onClick={flip}
        className={`text-xs font-medium uppercase tracking-wider ${
          watch?.enabled ? "text-[var(--accent)]" : "text-[var(--muted)]"
        }`}
      >
        {watch?.enabled ? "Watching" : "Watch price"}
      </button>
      {watch?.enabled && summary && (
        <>
          <Sparkline points={watch.history.map((p) => p.price)} />
          <div className="text-[11px] text-[var(--muted)] flex items-center gap-1 ml-auto">
            {summary.changePct < 0 ? (
              <TrendingDown
                size={11}
                strokeWidth={1.75}
                className="text-emerald-400"
                aria-hidden
              />
            ) : (
              <TrendingUp
                size={11}
                strokeWidth={1.75}
                className="text-amber-400"
                aria-hidden
              />
            )}
            <span className="font-mono">
              ${summary.current.toFixed(0)} · {summary.changePct.toFixed(1)}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const w = 80;
  const h = 22;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = max === min ? h / 2 : h - ((p - min) / (max - min)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

// Re-export icons used by other surfaces so the bundler keeps them.
export const _TripExtrasIcons = { Activity, AlertCircle, Plane, Calendar, Clock };
