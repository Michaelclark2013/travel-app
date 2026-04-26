"use client";

import { useEffect, useMemo, useState } from "react";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  type Confirmation,
  addConfirmation,
  deleteConfirmation,
  loadConfirmations,
  loadConfirmationsAsync,
  parseEmail,
  saveConfirmations,
  summarize,
  updateConfirmation,
} from "@/lib/wallet";
import { createShare } from "@/lib/wallet-share";
import { loadTrips } from "@/lib/storage";
import type { Trip } from "@/lib/types";
import { ConfirmationCard, SpendingView, TimelineView } from "./_components";

type ViewMode = "cards" | "timeline" | "spending";

export default function WalletPage() {
  const { user, ready } = useRequireAuth();
  const [items, setItems] = useState<Confirmation[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [emailText, setEmailText] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("cards");
  const [tripFilter, setTripFilter] = useState<string>("all");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function refresh() {
    setItems(loadConfirmations());
  }

  useEffect(() => {
    if (!ready || !user) return;
    setTrips(loadTrips());
    setItems(loadConfirmations());
    loadConfirmationsAsync().then((remote) => {
      if (remote.length > 0) setItems(remote);
    });
  }, [ready, user]);

  // Mirror to localStorage on every change so the PWA offline view works.
  useEffect(() => {
    if (!ready || !user) return;
    if (items.length > 0) saveConfirmations(items);
  }, [items, ready, user]);

  function handleParse() {
    setParseError(null);
    const c = parseEmail(emailText);
    if (!c) {
      setParseError("Couldn't recognize that confirmation. Try a different one.");
      return;
    }
    addConfirmation(c);
    refresh();
    setEmailText("");
    setShowInput(false);
  }

  async function handleIngestApi() {
    setParseError(null);
    try {
      const res = await fetch("/api/wallet/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: emailText }),
      });
      const json = await res.json();
      if (!json.ok || !json.confirmation) {
        setParseError(json.error ?? "Server couldn't parse that confirmation.");
        return;
      }
      const trip = trips.find(
        (t) => json.confirmation.date >= t.startDate && json.confirmation.date <= t.endDate
      );
      addConfirmation({ ...json.confirmation, tripId: trip?.id, source: "ingest" });
      refresh();
      setEmailText("");
      setShowInput(false);
    } catch {
      setParseError("Network error reaching the parser.");
    }
  }

  function handleSeed() {
    const samples = [
      `Subject: Your Delta itinerary
Delta confirmation #DLG7H9
Flight DL182 from JFK to NRT
2026-05-09 · 18:30
Total: $872`,
      `Hilton Tokyo reservation
Confirmation: HLT-44A21
Check-in 2026-05-09, check-out 2026-05-15
Total: ¥218,000`,
      `OpenTable: Reservation at Sushi Saito
Date: May 11, 2026 · 7:30 PM
Confirmation: OT-8821-K`,
      `Klook: Tokyo SkyTree Skip-the-Line tickets
2026-05-12 · 14:00
Booking: KLK-99213-T
Total: ¥9,800`,
      `Eurostar: Paris → London
Departure 2026-05-17 · 09:13
Booking reference: ESR-7HZ221
Total: €189.50`,
      `Hertz rental car at LAX
Confirmation H-22ABCD
Pickup 2026-05-22, return 2026-05-25
Total: $345.00`,
    ];
    samples.forEach((s) => {
      const c = parseEmail(s);
      if (c) addConfirmation(c);
    });
    refresh();
  }

  async function handleShare() {
    const tripId = tripFilter === "all" || tripFilter === "unfiled" ? undefined : tripFilter;
    const tripLabel =
      tripId && trips.find((t) => t.id === tripId)
        ? trips.find((t) => t.id === tripId)!.destination
        : tripFilter === "unfiled"
          ? "Unfiled"
          : "All trips";
    const payload = await createShare({ tripId, tripLabel });
    const url = `${window.location.origin}/wallet/share/${payload.token}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore — clipboard requires HTTPS / user gesture in some browsers
    }
  }

  const filtered = useMemo(() => {
    if (tripFilter === "all") return items;
    if (tripFilter === "unfiled") return items.filter((i) => !i.tripId);
    return items.filter((i) => i.tripId === tripFilter);
  }, [items, tripFilter]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const av = `${a.date} ${a.time ?? ""}`;
        const bv = `${b.date} ${b.time ?? ""}`;
        return av.localeCompare(bv);
      }),
    [filtered]
  );

  const summary = useMemo(() => summarize(filtered), [filtered]);

  const grouped = useMemo(() => {
    return sorted.reduce<Record<string, Confirmation[]>>((acc, c) => {
      const tripLabel = c.tripId
        ? trips.find((t) => t.id === c.tripId)?.destination ?? "Unfiled"
        : "Unfiled";
      (acc[tripLabel] ??= []).push(c);
      return acc;
    }, {});
  }, [sorted, trips]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Trip wallet</h1>
          <p className="text-[var(--muted)] mt-2">
            Every booking, ticket, and reservation in one place. Forward
            confirmation emails or paste them below.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {items.length === 0 && (
            <button onClick={handleSeed} className="btn-steel px-4 py-2.5 text-sm">
              Load demo data
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={handleShare}
              className="btn-steel px-4 py-2.5 text-sm"
              title="Create a shareable link to this wallet"
            >
              ↗ Share
            </button>
          )}
          <button
            onClick={() => setShowInput((v) => !v)}
            className="btn-primary px-5 py-2.5 text-sm"
          >
            {showInput ? "Cancel" : "+ Add confirmation"}
          </button>
        </div>
      </div>

      {shareUrl && (
        <div
          className="steel mt-6 p-4 flex items-center gap-3 flex-wrap"
          role="status"
        >
          <div className="text-sm">
            Shareable link copied to clipboard. Anyone with it can view this wallet.
          </div>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-[var(--accent)] truncate flex-1 min-w-0"
          >
            {shareUrl}
          </a>
          <button
            onClick={() => setShareUrl(null)}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Dismiss
          </button>
        </div>
      )}

      {showInput && (
        <div className="steel mt-6 p-5">
          <div className="text-sm font-medium mb-2">
            Paste your confirmation email
          </div>
          <textarea
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            placeholder="Subject: Your booking confirmation..."
            rows={6}
            className="input"
            style={{
              height: "auto",
              padding: "12px 14px",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 13,
            }}
          />
          {parseError && (
            <div className="mt-3 text-sm text-[var(--danger)]">{parseError}</div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={handleIngestApi} className="btn-steel px-4 py-2 text-sm">
              Parse via API
            </button>
            <button onClick={handleParse} className="btn-primary px-5 py-2.5 text-sm">
              Parse & save
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !showInput && (
        <div className="steel mt-10 p-12 text-center">
          <div className="text-6xl mb-5">📨</div>
          <h3 className="text-2xl font-bold tracking-tight">
            Nothing in your wallet yet
          </h3>
          <p className="text-[var(--muted)] mt-3 max-w-md mx-auto">
            Forward any travel confirmation to your wallet — flights, hotels,
            rental cars, restaurant reservations. We&apos;ll auto-link them to
            the right trip.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-8 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm">
              {(["cards", "timeline", "spending"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setView(m)}
                  className={
                    "px-3 py-1.5 rounded-md border " +
                    (view === m
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]")
                  }
                >
                  {m === "cards" ? "Cards" : m === "timeline" ? "Timeline" : "Spending"}
                </button>
              ))}
            </div>
            <select
              value={tripFilter}
              onChange={(e) => setTripFilter(e.target.value)}
              className="input"
              style={{ width: "auto", padding: "8px 12px", fontSize: 13 }}
            >
              <option value="all">All trips</option>
              <option value="unfiled">Unfiled</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.destination}
                </option>
              ))}
            </select>
          </div>

          {view === "cards" && (
            <div className="mt-6 space-y-8">
              {Object.entries(grouped).map(([tripLabel, list]) => (
                <div key={tripLabel}>
                  <h2 className="text-lg font-bold mb-3">{tripLabel}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {list.map((c) => (
                      <ConfirmationCard
                        key={c.id}
                        c={c}
                        onUpdate={(p) => {
                          updateConfirmation(c.id, p);
                          refresh();
                        }}
                        onDelete={() => {
                          deleteConfirmation(c.id);
                          refresh();
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {view === "timeline" && <TimelineView items={sorted} />}
          {view === "spending" && <SpendingView summary={summary} />}
        </>
      )}
    </div>
  );
}
