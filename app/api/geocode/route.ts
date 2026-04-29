import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side geocoding proxy. Mapbox preferred when MAPBOX_TOKEN is set,
// Nominatim as a no-key fallback. Output schema is deliberately a thin
// superset of both so the autocomplete component can stay vendor-neutral.

export type GeocodePlace = {
  id: string;
  name: string;
  /** Full human label for display, e.g. "Newport Beach, California, USA". */
  fullName: string;
  /** "city" | "address" | "airport" | "poi" | "country" | "region" | "neighborhood" */
  kind: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  lat: number;
  lng: number;
  /** IATA airport code if known. */
  iata?: string;
};

export async function GET(req: NextRequest) {
  // Reverse-geocode mode — used by user-location.ts to convert GPS into a city.
  if (req.nextUrl.searchParams.get("reverse") === "1") {
    const lat = Number(req.nextUrl.searchParams.get("lat"));
    const lng = Number(req.nextUrl.searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "lat,lng required" }, { status: 400 });
    }
    try {
      const place = await reverseGeocode(lat, lng);
      return NextResponse.json({ ok: true, ...place });
    } catch (err) {
      console.error("[geocode reverse]", err);
      return NextResponse.json(
        { ok: false, error: "Reverse geocode failed" },
        { status: 200 }
      );
    }
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ ok: true, results: [] });
  }
  try {
    const places = await geocode(q);
    return NextResponse.json({ ok: true, results: places });
  } catch (err) {
    console.error("[geocode]", err);
    return NextResponse.json(
      { ok: false, error: "Geocoding failed", results: [] },
      { status: 200 }
    );
  }
}

// Reverse geocode — Mapbox when keyed, Nominatim free fallback.
async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ name: string; city?: string; country?: string }> {
  const token = process.env.MAPBOX_TOKEN;
  if (token) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,neighborhood&access_token=${token}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`mapbox ${res.status}`);
    const data = await res.json();
    const feat = data?.features?.[0];
    return {
      name: feat?.text ?? feat?.place_name ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
      city: feat?.text,
      country: feat?.context?.find((c: { id: string }) =>
        c.id?.startsWith("country")
      )?.text,
    };
  }
  // Nominatim fallback — free, no key. Respects 1 req/sec policy in practice.
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "voyage-app (reverse-geocode)" },
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const data = await res.json();
  const a = data?.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.county;
  return {
    name: city ?? data?.display_name ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
    city,
    country: a.country,
  };
}

async function geocode(query: string): Promise<GeocodePlace[]> {
  const token = process.env.MAPBOX_TOKEN;
  if (token) return geocodeMapbox(query, token);
  return geocodeNominatim(query);
}

// ----- Mapbox -----

type MapboxFeature = {
  id: string;
  text: string;
  place_name: string;
  place_type?: string[];
  center: [number, number];
  context?: { id: string; text: string; short_code?: string }[];
  properties?: { short_code?: string; iata?: string; category?: string };
};

async function geocodeMapbox(
  query: string,
  token: string
): Promise<GeocodePlace[]> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?autocomplete=true&limit=8&types=country,region,place,locality,neighborhood,address,poi&language=en&access_token=${token}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: MapboxFeature[] };
  return (data.features ?? []).map(mapboxToPlace);
}

function mapboxToPlace(f: MapboxFeature): GeocodePlace {
  const ctx = (key: string) =>
    f.context?.find((c) => c.id.startsWith(key))?.text;
  const country = ctx("country") ?? "";
  const region = ctx("region") ?? "";
  const city = ctx("place") ?? (f.place_type?.includes("place") ? f.text : "");
  const t = f.place_type?.[0] ?? "place";
  let kind = "city";
  if (t === "country") kind = "country";
  else if (t === "region") kind = "region";
  else if (t === "neighborhood") kind = "neighborhood";
  else if (t === "address") kind = "address";
  else if (t === "poi") {
    const cat = (f.properties?.category ?? "").toLowerCase();
    if (cat.includes("airport")) kind = "airport";
    else kind = "poi";
  } else if (t === "locality" || t === "place") kind = "city";

  const iata = f.properties?.iata;
  return {
    id: f.id,
    name: f.text,
    fullName: f.place_name,
    kind,
    city: city || undefined,
    region: region || undefined,
    country: country || undefined,
    countryCode: f.context
      ?.find((c) => c.id.startsWith("country") && c.short_code)
      ?.short_code?.toUpperCase(),
    lat: f.center[1],
    lng: f.center[0],
    iata,
  };
}

// ----- Nominatim (OSM) -----

type NominatimResult = {
  place_id: number;
  display_name: string;
  name?: string;
  type?: string;
  class?: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
  extratags?: { iata?: string };
};

async function geocodeNominatim(query: string): Promise<GeocodePlace[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=1&extratags=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      // Nominatim requires a descriptive User-Agent. Keep this contact route
      // open per their usage policy.
      "User-Agent": "Voyage/1.0 (https://travel-app-tan-gamma.vercel.app)",
      "Accept-Language": "en",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as NominatimResult[];
  return data.map(nominatimToPlace);
}

function nominatimToPlace(r: NominatimResult): GeocodePlace {
  const cls = r.class ?? "";
  const t = r.type ?? "";
  let kind = "city";
  if (t === "country" || cls === "boundary") kind = "country";
  else if (t === "state" || t === "region") kind = "region";
  else if (cls === "highway" || cls === "place" && t === "house") kind = "address";
  else if (cls === "aeroway" || t === "aerodrome") kind = "airport";
  else if (cls === "amenity" || cls === "leisure" || cls === "tourism") kind = "poi";
  else if (t === "city" || t === "town" || t === "village" || t === "municipality")
    kind = "city";
  else if (t === "suburb" || t === "neighbourhood") kind = "neighborhood";

  return {
    id: `nom-${r.place_id}`,
    name: r.name ?? r.display_name.split(",")[0],
    fullName: r.display_name,
    kind,
    city: r.address?.city ?? r.address?.town ?? r.address?.village,
    region: r.address?.state,
    country: r.address?.country,
    countryCode: r.address?.country_code?.toUpperCase(),
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    iata: r.extratags?.iata,
  };
}
