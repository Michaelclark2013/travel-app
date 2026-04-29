"use client";

// Reusable "✦ Plan a trip here" button. Drops onto any tile or modal that
// shows a destination — explore feed, public profiles, journal lightbox,
// trip detail. Routes to /plan?destination=...&origin=... so the planner
// loads pre-filled and the user is one click from a generated itinerary.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  getCurrentLocation,
  getPreferredOrigin,
  type LocationHint,
} from "@/lib/user-location";

export default function PlanFromHere({
  destination,
  size = "md",
  className = "",
}: {
  destination: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [origin, setOrigin] = useState<LocationHint | null>(null);

  useEffect(() => {
    setOrigin(getPreferredOrigin());
  }, []);

  if (!destination) return null;

  const href = `/plan?destination=${encodeURIComponent(destination)}${
    origin ? `&origin=${encodeURIComponent(origin.label)}` : ""
  }`;

  const sizeCls =
    size === "sm"
      ? "px-2.5 py-1 text-[10px]"
      : "px-3 py-1.5 text-xs";

  return (
    <Link
      href={href}
      className={`btn-primary ${sizeCls} inline-flex items-center gap-1 shrink-0 ${className}`}
      title={
        origin
          ? `Plan a trip from ${origin.label} to ${destination}`
          : `Plan a trip to ${destination}`
      }
    >
      <Sparkles size={size === "sm" ? 11 : 13} strokeWidth={2} />
      Plan a trip here
    </Link>
  );
}

/** Small "Planning from {origin}" pill — used at top of /explore. */
export function PlanningFromPill({
  onUseCurrent,
}: {
  onUseCurrent?: () => void;
}) {
  const [origin, setOrigin] = useState<LocationHint | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOrigin(getPreferredOrigin());
  }, []);

  async function useCurrent() {
    setBusy(true);
    try {
      const cur = await getCurrentLocation({ fresh: true });
      if (cur) {
        setOrigin(cur);
        onUseCurrent?.();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!origin) return null;
  const sourceLabel =
    origin.source === "geolocation"
      ? "📍 Current"
      : origin.source === "profile"
      ? "🏠 Home"
      : origin.source === "timezone"
      ? "🌐 Detected"
      : "🏠 Home";

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card-strong)] px-3 py-1.5 text-xs">
      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--muted)]">
        Planning from
      </span>
      <span className="font-medium">{sourceLabel} · {origin.label}</span>
      {origin.source !== "geolocation" && (
        <button
          onClick={useCurrent}
          disabled={busy}
          className="text-[var(--accent)] hover:underline disabled:opacity-50"
        >
          {busy ? "…" : "use current"}
        </button>
      )}
    </div>
  );
}
