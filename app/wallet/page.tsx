"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  type Confirmation,
  addConfirmation,
  loadConfirmations,
  parseEmail,
} from "@/lib/wallet";
import { loadTrips } from "@/lib/storage";
import type { Trip } from "@/lib/types";

const CATEGORY_META: Record<
  Confirmation["type"],
  { label: string; icon: string }
> = {
  flight: { label: "Flight", icon: "✈️" },
  hotel: { label: "Hotel", icon: "🏨" },
  car: { label: "Rental car", icon: "🚗" },
  restaurant: { label: "Dining", icon: "🍽️" },
  activity: { label: "Activity", icon: "🎟️" },
  train: { label: "Train", icon: "🚆" },
};

export default function WalletPage() {
  const { user, ready } = useRequireAuth();
  const [items, setItems] = useState<Confirmation[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [emailText, setEmailText] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    setItems(loadConfirmations());
    setTrips(loadTrips());
  }, [ready, user]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  function handleParse() {
    const c = parseEmail(emailText);
    if (!c) {
      setParseError("Couldn't recognize that confirmation. Try a different one.");
      return;
    }
    addConfirmation(c);
    setItems(loadConfirmations());
    setEmailText("");
    setShowInput(false);
    setParseError(null);
  }

  function handleSeed() {
    const samples = [
      `Delta confirmation #DLG7H9
Flight DL182 from JFK to NRT
2026-05-09 · 18:30
Total: $872`,
      `Hilton Tokyo reservation
Confirmation: HLT-44A21
Check-in 2026-05-09, check-out 2026-05-15
Total: $1,440`,
      `OpenTable: Reservation at Sushi Saito
Date: May 11, 2026 · 7:30 PM
Confirmation: OT-8821-K`,
      `Klook: Tokyo SkyTree Skip-the-Line tickets
2026-05-12 · 14:00
Booking: KLK-99213-T
Total: $84`,
    ];
    samples.forEach((s) => {
      const c = parseEmail(s);
      if (c) addConfirmation(c);
    });
    setItems(loadConfirmations());
  }

  const grouped = items.reduce<Record<string, Confirmation[]>>((acc, c) => {
    const tripLabel = c.tripId
      ? trips.find((t) => t.id === c.tripId)?.destination ?? "Unfiled"
      : "Unfiled";
    (acc[tripLabel] ??= []).push(c);
    return acc;
  }, {});

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
        <div className="flex gap-2">
          {items.length === 0 && (
            <button onClick={handleSeed} className="btn-steel px-4 py-2.5 text-sm">
              Load demo data
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
            style={{ height: "auto", padding: "12px 14px", fontFamily: "var(--font-geist-mono), monospace", fontSize: 13 }}
          />
          {parseError && (
            <div className="mt-3 text-sm text-[var(--danger)]">{parseError}</div>
          )}
          <div className="mt-4 flex justify-end">
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
        <div className="mt-8 space-y-8">
          {Object.entries(grouped).map(([tripLabel, list]) => (
            <div key={tripLabel}>
              <h2 className="text-lg font-bold mb-3">{tripLabel}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {list.map((c) => (
                  <ConfirmationCard key={c.id} c={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmationCard({ c }: { c: Confirmation }) {
  const meta = CATEGORY_META[c.type];
  const date = new Date(c.date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div className="steel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{meta.icon}</div>
          <div>
            <div className="font-bold">{c.title}</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              {c.vendor} · {meta.label}
            </div>
          </div>
        </div>
        {c.totalUsd != null && (
          <div className="text-right">
            <div className="text-lg font-bold tracking-tight">
              ${c.totalUsd.toLocaleString()}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[var(--muted)]">When</div>
          <div className="font-medium mt-0.5">
            {date}
            {c.time ? ` · ${c.time}` : ""}
          </div>
        </div>
        <div>
          <div className="text-[var(--muted)]">Reference</div>
          <div className="font-medium mt-0.5 font-mono">{c.reference}</div>
        </div>
      </div>
    </div>
  );
}
