"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/components/AuthProvider";

type Category = "coffee" | "food" | "bar" | "shop" | "park";

type Place = {
  id: string;
  name: string;
  category: Category;
  rating: number;
  priceLevel: 1 | 2 | 3 | 4;
  lat: number;
  lng: number;
  blurb: string;
  openNow: boolean;
};

const CATEGORY_META: Record<
  Category,
  { label: string; emoji: string; color: string }
> = {
  coffee: { label: "Coffee", emoji: "☕", color: "bg-amber-100 text-amber-900" },
  food: { label: "Food", emoji: "🍴", color: "bg-rose-100 text-rose-900" },
  bar: { label: "Bars", emoji: "🍸", color: "bg-purple-100 text-purple-900" },
  shop: { label: "Shops", emoji: "🛍️", color: "bg-sky-100 text-sky-900" },
  park: { label: "Parks", emoji: "🌳", color: "bg-emerald-100 text-emerald-900" },
};

const NAME_PARTS_BY_CATEGORY: Record<Category, string[][]> = {
  coffee: [
    ["Daily", "Bluestone", "Saint", "Brew", "Verve", "Common", "Field", "Stumptown", "Kettle", "Roman"],
    ["Coffee", "Roasters", "Espresso", "Café", "& Co.", "Bar"],
  ],
  food: [
    ["Plenty", "Aster", "Maison", "Hen", "Loyal", "Olive", "Curio", "Magnolia", "Salt", "Embers"],
    ["Kitchen", "Table", "Bistro", "Tavern", "Cantina", "Diner", "House"],
  ],
  bar: [
    ["The", "Velvet", "Last", "Gold", "Halcyon", "Iron", "Library", "Foxtail", "Hush", "Saint"],
    ["Lounge", "Room", "Bar", "Speakeasy", "Tap", "Cellar"],
  ],
  shop: [
    ["Common", "Goods", "Field", "Hawthorn", "Maker", "Modern", "Maris", "Linden", "Anchor", "Folio"],
    ["Goods", "Studio", "Market", "Supply", "Provisions", "Co."],
  ],
  park: [
    ["Cedar", "Fountain", "Lakeside", "Riverside", "Highline", "Pine", "Sunset", "Old Town", "Mariner", "Civic"],
    ["Park", "Gardens", "Square", "Greens", "Commons", "Grove"],
  ],
};

const BLURBS: Record<Category, string[]> = {
  coffee: [
    "Bright pour-overs, oat milk on tap.",
    "Tiny corner spot. Single-origin only.",
    "Locals love the cardamom latte.",
    "Big windows, free Wi-Fi, fast service.",
  ],
  food: [
    "Seasonal small plates, walk-in friendly.",
    "Wood-fired everything, lively at night.",
    "Vegetarian-leaning, sourdough is great.",
    "Counter seating, chef's choice.",
  ],
  bar: [
    "Low-lit, vinyl, classics done right.",
    "Natural wine list. Snacks until late.",
    "Rooftop with skyline views.",
    "Hidden behind a bookshop.",
  ],
  shop: [
    "Independent design and homeware.",
    "Vintage finds and zines.",
    "Local makers, small batch.",
    "Plants, candles, small gifts.",
  ],
  park: [
    "Tree-lined paths and a duck pond.",
    "Skyline views from the north hill.",
    "Weekend market on Saturdays.",
    "Quiet benches, good for a coffee walk.",
  ],
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

function generatePlacesNear(lat: number, lng: number, key: string): Place[] {
  const seed = hashString(`${lat.toFixed(2)}|${lng.toFixed(2)}|${key}`);
  const r = mulberry32(seed);
  const cats: Category[] = ["coffee", "food", "bar", "shop", "park"];
  const places: Place[] = [];
  for (let i = 0; i < 30; i++) {
    const cat = pick(cats, r);
    const parts = NAME_PARTS_BY_CATEGORY[cat];
    const name = `${pick(parts[0], r)} ${pick(parts[1], r)}`;
    // Random offset within ~2.5km
    const offsetLat = (r() - 0.5) * 0.045;
    const offsetLng = (r() - 0.5) * 0.045;
    places.push({
      id: `place-${seed}-${i}`,
      name,
      category: cat,
      rating: Math.round((4 + r() * 1) * 10) / 10,
      priceLevel: ((Math.floor(r() * 4) + 1) as 1 | 2 | 3 | 4),
      lat: lat + offsetLat,
      lng: lng + offsetLng,
      blurb: pick(BLURBS[cat], r),
      openNow: r() > 0.18,
    });
  }
  return places;
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fmtDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Demo coordinates for some popular cities — used when "Use city" is picked.
const CITY_COORDS: Record<string, [number, number]> = {
  Tokyo: [35.6762, 139.6503],
  Lisbon: [38.7223, -9.1393],
  "Mexico City": [19.4326, -99.1332],
  "Reykjavík": [64.1466, -21.9426],
  Marrakech: [31.6295, -7.9811],
  "Buenos Aires": [-34.6037, -58.3816],
  Paris: [48.8566, 2.3522],
  "New York": [40.7128, -74.006],
  London: [51.5072, -0.1276],
  Barcelona: [41.3874, 2.1686],
};

function NearbyInner() {
  const { user, ready } = useRequireAuth();
  const searchParams = useSearchParams();
  const cityFromUrl = searchParams.get("city") ?? "";

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [coordSource, setCoordSource] = useState<"gps" | "city" | null>(null);
  const [coordLabel, setCoordLabel] = useState<string>("");
  const [loadingGps, setLoadingGps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCats, setActiveCats] = useState<Category[]>([
    "coffee",
    "food",
    "bar",
    "shop",
    "park",
  ]);
  const [openOnly, setOpenOnly] = useState(false);
  const [cityInput, setCityInput] = useState(cityFromUrl);

  useEffect(() => {
    if (cityFromUrl && CITY_COORDS[cityFromUrl]) {
      const [lat, lng] = CITY_COORDS[cityFromUrl];
      setCoords({ lat, lng });
      setCoordSource("city");
      setCoordLabel(cityFromUrl);
    }
  }, [cityFromUrl]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("Geolocation isn't available in this browser.");
      return;
    }
    setLoadingGps(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCoordSource("gps");
        setCoordLabel("your location");
        setLoadingGps(false);
      },
      (err) => {
        setError(err.message || "Couldn't get your location.");
        setLoadingGps(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  function useCity() {
    const match = Object.keys(CITY_COORDS).find(
      (c) => c.toLowerCase() === cityInput.trim().toLowerCase()
    );
    if (!match) {
      setError(
        `We don't have demo coordinates for "${cityInput}" yet. Try Tokyo, Paris, New York, Lisbon, London, Barcelona.`
      );
      return;
    }
    const [lat, lng] = CITY_COORDS[match];
    setCoords({ lat, lng });
    setCoordSource("city");
    setCoordLabel(match);
    setError(null);
  }

  const places = useMemo(() => {
    if (!coords) return [] as (Place & { distanceMeters: number })[];
    const all = generatePlacesNear(
      coords.lat,
      coords.lng,
      coordSource ?? "default"
    );
    return all
      .map((p) => ({
        ...p,
        distanceMeters: haversineMeters(coords.lat, coords.lng, p.lat, p.lng),
      }))
      .filter((p) => activeCats.includes(p.category))
      .filter((p) => (openOnly ? p.openNow : true))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [coords, coordSource, activeCats, openOnly]);

  function toggleCat(c: Category) {
    setActiveCats((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
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
      <h1 className="text-4xl font-bold tracking-tight">
        What&apos;s nearby?
      </h1>
      <p className="text-[var(--muted)] mt-3">
        Coffee, food, bars, and parks near you. Use your real location on
        the road, or scout a city before you go.
      </p>

      <div className="steel mt-6 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <button
            onClick={useMyLocation}
            disabled={loadingGps}
            className="btn-primary px-5 py-3 disabled:opacity-50"
          >
            {loadingGps ? "Finding you…" : "📍 Use my location"}
          </button>
          <span className="text-sm text-[var(--muted)] self-center">
            or pick a city
          </span>
          <label className="flex-1 min-w-[200px]">
            <input
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="Tokyo, Paris, New York…"
              className="input"
            />
          </label>
          <button
            onClick={useCity}
            disabled={!cityInput}
            className="btn-steel px-5 py-3 disabled:opacity-50"
          >
            Go
          </button>
        </div>
        {error && (
          <div className="mt-3 border border-[var(--danger)]/50 bg-[var(--danger)]/10 px-3 py-2.5 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}
        {coords && (
          <div className="mt-3 text-sm text-[var(--muted)]">
            Showing places near{" "}
            <strong className="text-white">{coordLabel}</strong>
          </div>
        )}
      </div>

      {coords && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {(Object.keys(CATEGORY_META) as Category[]).map((c) => {
            const m = CATEGORY_META[c];
            const active = activeCats.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleCat(c)}
                className={`border px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-white text-black border-white" : "btn-steel"
                }`}
              >
                <span className="mr-1">{m.emoji}</span>
                {m.label}
              </button>
            );
          })}
          <label className="ml-auto inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            Open now only
          </label>
        </div>
      )}

      {!coords && (
        <div className="steel mt-10 p-12 text-center">
          <div className="text-6xl mb-5">📍</div>
          <h3 className="text-2xl font-bold tracking-tight">
            Where are you?
          </h3>
          <p className="text-[var(--muted)] mt-3 max-w-md mx-auto">
            Tap &quot;Use my location&quot; to see what&apos;s around you
            right now — or pick a city to scout it before you arrive.
          </p>
        </div>
      )}

      {coords && places.length > 0 && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {places.map((p) => (
            <PlaceCard key={p.id} place={p} />
          ))}
        </div>
      )}

      {coords && places.length === 0 && (
        <div className="mt-10 text-center text-[var(--muted)]">
          Nothing matches those filters.
        </div>
      )}
    </div>
  );
}

function PlaceCard({
  place,
}: {
  place: Place & { distanceMeters: number };
}) {
  const meta = CATEGORY_META[place.category];
  return (
    <div className="steel p-5 hover:brightness-125 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="inline-flex items-center gap-1 bg-white/10 border border-[var(--edge)] px-2 py-0.5 text-xs font-medium">
            <span>{meta.emoji}</span>
            <span>{meta.label}</span>
          </span>
          <h3 className="mt-3 font-bold text-lg truncate">{place.name}</h3>
          <p className="text-sm text-[var(--muted)] mt-1">{place.blurb}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-medium">
            ⭐ {place.rating.toFixed(1)}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {"$".repeat(place.priceLevel)}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs border-t border-[var(--edge)] pt-3">
        <span className="text-[var(--muted)]">
          {fmtDistance(place.distanceMeters)} away
        </span>
        <span className={place.openNow ? "text-white" : "text-[var(--muted)]"}>
          {place.openNow ? "● Open now" : "○ Closed"}
        </span>
      </div>
    </div>
  );
}

export default function NearbyPage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center text-[var(--muted)]">Loading…</div>
      }
    >
      <NearbyInner />
    </Suspense>
  );
}
