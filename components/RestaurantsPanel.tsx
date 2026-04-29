"use client";

// Real local-restaurants panel for /trips/[id]. Pulls from /api/intel/restaurants
// (OSM Overpass) so it works globally, no key required. Each result is
// actionable: add to itinerary on a chosen day, share via DM, open the
// restaurant's website / phone.

import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Phone,
  Plus,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import ShareSheet from "@/components/ShareSheet";
import { toast } from "@/lib/toast";
import type { Trip, ItineraryItem } from "@/lib/types";

type Restaurant = {
  id: string;
  name: string;
  cuisine?: string;
  address?: string;
  lat: number;
  lng: number;
  openingHours?: string;
  website?: string;
  phone?: string;
  priceLevel?: string;
};

const CUISINE_ICON: Record<string, string> = {
  pizza: "🍕",
  sushi: "🍣",
  japanese: "🍱",
  italian: "🍝",
  mexican: "🌮",
  thai: "🍜",
  chinese: "🥡",
  indian: "🍛",
  burger: "🍔",
  ramen: "🍜",
  korean: "🍲",
  vegan: "🥗",
  vegetarian: "🥬",
  coffee: "☕",
  cafe: "☕",
  bakery: "🥐",
  steakhouse: "🥩",
  seafood: "🦞",
  french: "🥖",
  spanish: "🥘",
  bar: "🍸",
  pub: "🍺",
};

export default function RestaurantsPanel({
  trip,
  onAddToItinerary,
}: {
  trip: Trip;
  onAddToItinerary: (dayIdx: number, item: ItineraryItem) => void;
}) {
  const [results, setResults] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pickDayFor, setPickDayFor] = useState<Restaurant | null>(null);
  const [shareFor, setShareFor] = useState<Restaurant | null>(null);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/intel/restaurants?city=${encodeURIComponent(trip.destination)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (aborted) return;
        if (!data.ok) {
          setError(data.error ?? "Couldn't load restaurants");
          setResults([]);
        } else {
          setResults(data.results ?? []);
        }
      })
      .catch((err) => {
        if (!aborted) setError(err.message ?? "Network error");
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [trip.destination]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return results;
    return results.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.cuisine ?? "").toLowerCase().includes(q) ||
        (r.address ?? "").toLowerCase().includes(q)
    );
  }, [results, filter]);

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
            // 🍽 EAT NEAR {trip.destination.toUpperCase()}
          </div>
          <div className="text-lg font-semibold mt-1">
            {loading
              ? "Finding spots…"
              : `${filtered.length} place${filtered.length === 1 ? "" : "s"} ready to add`}
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-emerald-300 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5">
          ● Live · OSM
        </span>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      ) : (
        <>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by cuisine, name, street…"
            className="input mt-4"
          />

          {loading && results.length === 0 && (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 shimmer h-16"
                />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="mt-4 text-sm text-[var(--muted)] text-center py-6">
              No restaurants in OSM for {trip.destination}. Try another query
              or check back later.
            </div>
          )}

          <ul className="mt-4 space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center text-lg shrink-0">
                    {(r.cuisine && CUISINE_ICON[r.cuisine.toLowerCase()]) ??
                      "🍽"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {r.name}
                      {r.priceLevel && (
                        <span className="text-[var(--muted)] ml-2 text-xs">
                          {r.priceLevel}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--muted)] truncate">
                      {[r.cuisine, r.address].filter(Boolean).join(" · ")}
                      {r.openingHours && ` · ${r.openingHours}`}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 pl-13 sm:pl-13">
                  <button
                    onClick={() => setPickDayFor(r)}
                    className="btn-primary text-[11px] px-2.5 py-1 inline-flex items-center gap-1"
                  >
                    <Plus size={11} strokeWidth={2.4} />
                    Add to plan
                  </button>
                  <button
                    onClick={() => setShareFor(r)}
                    className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1"
                  >
                    <Sparkles size={11} strokeWidth={2.4} />
                    Share
                  </button>
                  {r.website && (
                    <a
                      href={r.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1"
                    >
                      <ExternalLink size={11} strokeWidth={2.4} />
                      Website
                    </a>
                  )}
                  {r.phone && (
                    <a
                      href={`tel:${r.phone}`}
                      className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1"
                    >
                      <Phone size={11} strokeWidth={2.4} />
                      Call
                    </a>
                  )}
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(
                      `${r.name} ${r.address ?? trip.destination}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1"
                  >
                    <UtensilsCrossed size={11} strokeWidth={2.4} />
                    Maps
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pickDayFor && (
        <PickDaySheet
          trip={trip}
          restaurant={pickDayFor}
          onClose={() => setPickDayFor(null)}
          onAdd={(dayIdx) => {
            const r = pickDayFor;
            const day = trip.itinerary[dayIdx];
            if (!day) return;
            const item: ItineraryItem = {
              id: `${day.date}-resto-${Date.now()}`,
              time: "19:30",
              title: r.name,
              description: [r.cuisine, r.address].filter(Boolean).join(" · "),
              category: "food",
              location: { name: r.name, lat: r.lat, lng: r.lng },
            };
            onAddToItinerary(dayIdx, item);
            setPickDayFor(null);
            toast.success(`Added ${r.name} to ${day.label}`);
          }}
        />
      )}

      {shareFor && (
        <ShareSheet
          open
          onClose={() => setShareFor(null)}
          target={{
            kind: "place",
            name: `${shareFor.name}${
              shareFor.address ? ` · ${shareFor.address}` : ""
            }`,
          }}
          shareText={`Eat at ${shareFor.name} — ${trip.destination}`}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
function PickDaySheet({
  trip,
  restaurant,
  onClose,
  onAdd,
}: {
  trip: Trip;
  restaurant: Restaurant;
  onClose: () => void;
  onAdd: (dayIdx: number) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-label="Pick a day"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--border-strong)] shadow-2xl p-5"
        style={{
          background: "var(--background-soft)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)",
        }}
      >
        <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
          // ADD TO PLAN
        </div>
        <h3 className="text-lg font-semibold mt-0.5">
          Which day for {restaurant.name}?
        </h3>
        <ul className="mt-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
          {trip.itinerary.map((d, idx) => (
            <li key={d.date}>
              <button
                onClick={() => onAdd(idx)}
                className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--card-strong)] hover:border-[var(--border-strong)] p-3"
              >
                <div className="text-xs font-mono uppercase tracking-[0.18em] text-[var(--muted)]">
                  Day {idx + 1}
                </div>
                <div className="font-medium text-sm mt-0.5">{d.label}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {d.items.length} stop{d.items.length === 1 ? "" : "s"}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="btn-ghost mt-4 w-full text-sm py-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
