"use client";

// Auto-scans a trip on mount and surfaces issues. Caches per-trip in
// localStorage keyed by a hash of the relevant fields, so we don't re-call
// Claude on every page navigation.
//
// Track D: soft Pro gate — free users are capped at 1 manual re-scan per
// trip per day (auto-scan on first load is always free; the rate-limit only
// applies to the "Re-scan" button). `isPro()` returns true today (Stripe not
// wired) so the gate is dormant until the paywall is armed.

import { useEffect, useState } from "react";
import type { Trip } from "@/lib/types";
import { isPro } from "@/lib/pro";
import UpgradePrompt from "./UpgradePrompt";

const FREE_RESCAN_KEY_PREFIX = "voyage:tripdoctor:rescan:";

function todayKey(): string {
  const d = new Date();
  // YYYY-MM-DD in local time
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function rescanUsedToday(tripId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(FREE_RESCAN_KEY_PREFIX + tripId);
    return v === todayKey();
  } catch {
    return false;
  }
}

function markRescanUsed(tripId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FREE_RESCAN_KEY_PREFIX + tripId, todayKey());
  } catch {}
}

type Severity = "critical" | "warning" | "fyi";

type Finding = {
  severity: Severity;
  category: string;
  title: string;
  body: string;
  suggestion?: string;
  dayIndex?: number;
};

type Result = {
  scannedAt: string;
  findings: Finding[];
  source: "claude" | "mock";
};

const CATEGORY_ICON: Record<string, string> = {
  timing: "⏱",
  logistics: "📋",
  weather: "🌧",
  openness: "🚪",
  transit: "🚄",
  budget: "💰",
  energy: "🔋",
  documentation: "📄",
  health: "💊",
};

const SEV_STYLE: Record<Severity, string> = {
  critical: "border-rose-500/50 bg-rose-500/8 text-rose-200",
  warning: "border-amber-500/50 bg-amber-500/8 text-amber-200",
  fyi: "border-sky-500/40 bg-sky-500/6 text-sky-200",
};

const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  fyi: "FYI",
};

function tripFingerprint(trip: Trip): string {
  // Hash only the fields that affect doctor findings — skip mutable UI state.
  const parts = [
    trip.id,
    trip.destination,
    trip.startDate,
    trip.endDate,
    trip.travelers,
    trip.transportMode,
    JSON.stringify(trip.stops ?? []),
    JSON.stringify(
      trip.itinerary.map((d) => [d.date, d.items.length, d.stopDestination])
    ),
  ];
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `td-${trip.id}-${(h >>> 0).toString(36)}`;
}

function loadCached(key: string): Result | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Result) : null;
  } catch {
    return null;
  }
}

function saveCached(key: string, r: Result) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(r));
  } catch {}
}

export default function TripDoctor({ trip }: { trip: Trip }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  // Tracks whether the user has spent their free daily re-scan for this trip.
  // Stays in component state so the button updates without a remount; the
  // localStorage flag is the source of truth across reloads.
  const [rescanLocked, setRescanLocked] = useState(false);

  useEffect(() => {
    const key = tripFingerprint(trip);
    const cached = loadCached(key);
    setRescanLocked(!isPro() && rescanUsedToday(trip.id));
    if (cached) {
      setResult(cached);
      return;
    }
    // Initial scan (auto-load) is always free — we only meter the manual
    // "Re-scan" button. Use { auto: true } so we don't burn the daily quota.
    runScan({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, trip.startDate, trip.endDate, trip.itinerary.length]);

  async function runScan(opts: { auto?: boolean } = {}) {
    // Soft cap on manual re-scans for non-Pro users.
    if (!opts.auto && !isPro() && rescanUsedToday(trip.id)) {
      setUpgradeOpen(true);
      setRescanLocked(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Send a stripped-down trip to keep tokens low.
      const payload = {
        destination: trip.destination,
        origin: trip.origin,
        startDate: trip.startDate,
        endDate: trip.endDate,
        travelers: trip.travelers,
        transportMode: trip.transportMode,
        vibes: trip.vibes,
        intent: trip.intent,
        budget: trip.budget,
        stops: trip.stops,
        itinerary: trip.itinerary.map((d) => ({
          date: d.date,
          stop: d.stopDestination,
          items: d.items.map((i) => ({
            time: i.time,
            title: i.title,
            category: i.category,
          })),
        })),
      };
      const res = await fetch("/api/agent/trip-doctor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trip: payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const r: Result = {
        scannedAt: data.scannedAt,
        findings: data.findings,
        source: data.source,
      };
      setResult(r);
      saveCached(tripFingerprint(trip), r);
      // Manual re-scans count toward the daily free quota; the auto-load
      // initial scan does not.
      if (!opts.auto && !isPro()) {
        markRescanUsed(trip.id);
        setRescanLocked(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  if (busy && !result) {
    return (
      <div className="surface rounded-2xl p-5">
        <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
          // 🩺 TRIP DOCTOR
        </div>
        <div className="mt-2 text-sm text-[var(--muted)] inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
          Scanning your trip for issues…
        </div>
      </div>
    );
  }

  if (!result && error) {
    return (
      <div className="surface rounded-2xl p-5">
        <UpgradePrompt
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          reason="trip-doctor"
        />
        <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
          // 🩺 TRIP DOCTOR
        </div>
        <div className="mt-2 text-sm text-rose-300">Couldn&apos;t scan: {error}</div>
        <button
          onClick={() => runScan()}
          className="btn-ghost text-xs px-3 py-1.5 mt-3"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!result) return null;

  const visible = result.findings.filter((_, i) => !dismissed.has(`f-${i}`));

  return (
    <div className="surface rounded-2xl p-5">
      <UpgradePrompt
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="trip-doctor"
      />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
            // 🩺 TRIP DOCTOR
          </div>
          <div className="text-lg font-semibold mt-1">
            {visible.length === 0
              ? "Looks clean — no issues found."
              : `${visible.length} thing${visible.length === 1 ? "" : "s"} I'd check`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result.source === "mock" && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
              Demo
            </span>
          )}
          <button
            onClick={() =>
              rescanLocked ? setUpgradeOpen(true) : runScan()
            }
            disabled={busy}
            className="text-[10px] font-mono text-[var(--muted)] hover:text-white uppercase tracking-[0.16em] disabled:opacity-50"
            title={
              rescanLocked
                ? "Free re-scan used today — Pro is unlimited"
                : "Re-scan this trip"
            }
          >
            {busy
              ? "Scanning…"
              : rescanLocked
              ? "Re-scan · Pro"
              : "Re-scan"}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-3 text-sm text-[var(--muted)]">
          Doctor found no major issues. Trip looks ready to fly.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {result.findings.map((f, i) => {
            const id = `f-${i}`;
            if (dismissed.has(id)) return null;
            return (
              <li
                key={i}
                className={`rounded-xl border p-3 ${SEV_STYLE[f.severity]}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0" aria-hidden>
                    {CATEGORY_ICON[f.category] ?? "•"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-80">
                        {SEV_LABEL[f.severity]}
                        {f.dayIndex != null && ` · day ${f.dayIndex + 1}`}
                      </span>
                      <span className="text-sm font-medium text-white">
                        {f.title}
                      </span>
                    </div>
                    <p className="text-sm mt-1 opacity-90">{f.body}</p>
                    {f.suggestion && (
                      <p className="text-xs mt-2 italic opacity-80">
                        ↪ {f.suggestion}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      setDismissed((prev) => new Set(prev).add(id))
                    }
                    aria-label="Dismiss"
                    className="text-current/60 hover:text-white shrink-0"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
