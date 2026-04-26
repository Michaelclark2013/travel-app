"use client";

import { useEffect, useState } from "react";
import { useAuth, useRequireAuth } from "@/components/AuthProvider";
import {
  buildPersona,
  loadPreferences,
  savePreferences,
  type SavedPreferences,
  type TravelPersona,
} from "@/lib/preferences";

export default function ProfilePage() {
  const { user, ready, signOut } = useAuth();
  useRequireAuth();
  const [persona, setPersona] = useState<TravelPersona | null>(null);
  const [prefs, setPrefs] = useState<SavedPreferences>({
    preferAisle: false,
    avoidRedeyes: false,
    walkPace: "normal",
    diet: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    setPersona(buildPersona());
    setPrefs(loadPreferences());
  }, [ready, user]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  function update<K extends keyof SavedPreferences>(
    key: K,
    value: SavedPreferences[K]
  ) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePreferences(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Your profile</h1>
          <p className="text-[var(--muted)] mt-2">
            What we&apos;ve learned about how you travel — and what you can
            tune.
          </p>
        </div>
        <button onClick={signOut} className="btn-steel px-4 py-2.5 text-sm">
          Sign out
        </button>
      </div>

      <div className="steel mt-8 p-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 bg-white text-black flex items-center justify-center font-bold text-2xl">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-xl font-bold">{user.name}</div>
            <div className="text-sm text-[var(--muted)]">{user.email}</div>
          </div>
        </div>
      </div>

      {persona && persona.totalTrips > 0 ? (
        <div className="steel mt-6 p-6">
          <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
            YOUR TRAVEL PERSONA
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight">
            {personaSummary(persona)}
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Trips planned" value={persona.totalTrips.toString()} />
            <Stat label="Total stops" value={persona.totalActivities.toString()} />
            <Stat label="Avg trip length" value={`${persona.avgTripDays} days`} />
            <Stat label="Avg party size" value={persona.avgTravelers.toString()} />
          </div>

          {persona.topVibes.length > 0 && (
            <div className="mt-6">
              <div className="text-sm font-medium mb-2">
                You travel for…
              </div>
              <div className="flex flex-wrap gap-2">
                {persona.topVibes.map((v) => (
                  <span
                    key={v.vibe}
                    className="bg-white/8 border border-[var(--edge)] px-3 py-1.5 text-sm"
                  >
                    {v.vibe}{" "}
                    <span className="text-[var(--muted)] text-xs">
                      ({v.count})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="steel mt-6 p-6 text-center">
          <p className="text-[var(--muted)]">
            Plan a few trips and your travel persona will show up here.
          </p>
        </div>
      )}

      <div className="steel mt-6 p-6">
        <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
          PREFERENCES
        </div>
        <div className="mt-2 text-lg font-bold">
          We&apos;ll use these on every new trip
        </div>

        <div className="mt-5 space-y-4">
          <Toggle
            label="Prefer aisle seats"
            description="On flights you book through Voyage."
            value={prefs.preferAisle}
            onChange={(v) => update("preferAisle", v)}
          />
          <Toggle
            label="Avoid red-eye flights"
            description="Skip departures between 11pm and 5am."
            value={prefs.avoidRedeyes}
            onChange={(v) => update("avoidRedeyes", v)}
          />
          <div>
            <div className="text-sm font-medium">Walking pace</div>
            <div className="text-xs text-[var(--muted)] mb-2">
              We&apos;ll adjust travel times in your itinerary.
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["slow", "normal", "fast"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => update("walkPace", p)}
                  className={`border px-3 py-2 text-sm capitalize ${
                    prefs.walkPace === p
                      ? "bg-white text-black border-white"
                      : "btn-steel"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Diet / allergies</div>
            <div className="text-xs text-[var(--muted)] mb-2">
              We&apos;ll filter restaurant suggestions.
            </div>
            <input
              value={prefs.diet}
              onChange={(e) => update("diet", e.target.value)}
              placeholder="vegetarian, no shellfish, gluten-free…"
              className="input"
            />
          </div>
        </div>

        {saved && (
          <div className="mt-4 text-xs text-white">✓ Saved</div>
        )}
      </div>
    </div>
  );
}

function personaSummary(p: TravelPersona) {
  const parts: string[] = [];
  if (p.topVibes[0]) parts.push(`${p.topVibes[0].vibe.toLowerCase()}-driven`);
  if (p.preferredMode === "walk") parts.push("walker");
  else if (p.preferredMode === "transit") parts.push("transit-friendly");
  else if (p.preferredMode === "drive") parts.push("road-tripper");
  if (p.avgTripDays >= 7) parts.push("long-trip");
  else if (p.avgTripDays <= 3) parts.push("weekend-warrior");
  if (p.avgTravelers >= 3) parts.push("group");
  else if (p.avgTravelers === 1) parts.push("solo");
  else parts.push("duo");
  return parts.length
    ? `The ${parts.join(", ")} traveler.`
    : "Building your persona…";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-[var(--muted)] mt-0.5">{label}</div>
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full text-left flex items-start justify-between gap-4 py-2"
    >
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-[var(--muted)] mt-0.5">{description}</div>
      </div>
      <div
        className={`relative w-11 h-6 border ${
          value
            ? "bg-white border-white"
            : "bg-black/40 border-[var(--edge)]"
        } shrink-0`}
      >
        <div
          className={`absolute top-0.5 ${value ? "left-5" : "left-0.5"} h-5 w-5 transition-all ${
            value ? "bg-black" : "bg-[var(--muted)]"
          }`}
        />
      </div>
    </button>
  );
}
