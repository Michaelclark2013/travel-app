import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 1800; // 30 min CDN cache — restaurant data is slow-moving

// Real, global restaurant search via OpenStreetMap Overpass (no key, no quota).
// We try the higher-quality DoorDash MCP-style flow first via the user-facing
// "find on DoorDash" link; for the panel itself we use OSM because it's
// world-wide and reliable.
//
//   GET /api/intel/restaurants?city=Tokyo
//   GET /api/intel/restaurants?lat=35.66&lng=139.69
//
// Response is the shape the panel binds to:
//   { ok, source, results: [{ id, name, cuisine?, address?, lat, lng, openingHours?, website? }] }

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
  /** Cheap heuristic: $ / $$ / $$$ / $$$$ */
  priceLevel?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city")?.trim();
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");

  let lat: number | null = null;
  let lng: number | null = null;

  if (latRaw && lngRaw) {
    lat = Number(latRaw);
    lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: "Invalid lat/lng" },
        { status: 400 }
      );
    }
  } else if (city) {
    // Geocode the city via Nominatim (matches our reverse-geocode fallback).
    try {
      const g = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(city)}&limit=1`,
        {
          cache: "no-store",
          headers: { "User-Agent": "voyage-app (restaurants)" },
        }
      );
      if (!g.ok) throw new Error(`geocode ${g.status}`);
      const arr = (await g.json()) as Array<{ lat: string; lon: string }>;
      if (!arr || arr.length === 0) {
        return NextResponse.json({
          ok: true,
          source: "osm-empty",
          results: [],
        });
      }
      lat = Number(arr[0].lat);
      lng = Number(arr[0].lon);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "geocode failed",
        },
        { status: 502 }
      );
    }
  } else {
    return NextResponse.json(
      { ok: false, error: "city or lat,lng required" },
      { status: 400 }
    );
  }

  try {
    // Overpass query — restaurants + cafes + bars + fast_food within 1500m.
    const radius = 1500;
    const query = `[out:json][timeout:18];
      (
        node["amenity"~"restaurant|cafe|bar|fast_food|pub"](around:${radius},${lat},${lng});
        way["amenity"~"restaurant|cafe|bar|fast_food|pub"](around:${radius},${lat},${lng});
      );
      out center 60;`;
    // Overpass mirrors — main instance sometimes rate-limits server-to-server
    // traffic + 406s without a User-Agent. We try several before giving up.
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.openstreetmap.fr/api/interpreter",
    ];
    let res: Response | null = null;
    let lastErr = "";
    for (const url of endpoints) {
      try {
        const r = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
          method: "GET",
          headers: {
            "User-Agent":
              "voyage-app (+https://travel-app-tan-gamma.vercel.app)",
            Accept: "application/json",
          },
          next: { revalidate: 1800 },
        });
        if (r.ok) {
          res = r;
          break;
        }
        lastErr = `${url}: ${r.status}`;
      } catch (err) {
        lastErr = `${url}: ${
          err instanceof Error ? err.message : "fetch failed"
        }`;
      }
    }
    if (!res) throw new Error(`All Overpass mirrors failed (${lastErr})`);
    const data = (await res.json()) as {
      elements: Array<{
        id: number;
        type: "node" | "way";
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };

    const results: Restaurant[] = (data.elements ?? [])
      .map((el) => {
        const tags = el.tags ?? {};
        const name = tags.name ?? tags["name:en"];
        if (!name) return null;
        const elat = el.lat ?? el.center?.lat;
        const elng = el.lon ?? el.center?.lon;
        if (typeof elat !== "number" || typeof elng !== "number") return null;
        const r: Restaurant = {
          id: `${el.type}-${el.id}`,
          name,
          cuisine: tags.cuisine?.split(";")[0]?.trim(),
          address:
            [tags["addr:street"], tags["addr:housenumber"]]
              .filter(Boolean)
              .join(" ") ||
            tags["addr:full"] ||
            undefined,
          lat: elat,
          lng: elng,
          openingHours: tags.opening_hours,
          website: tags.website || tags["contact:website"],
          phone: tags.phone || tags["contact:phone"],
          priceLevel: priceFromTags(tags),
        };
        return r;
      })
      .filter((r): r is Restaurant => r !== null)
      // De-dupe by name+address — Overpass sometimes returns both node + way
      // for the same place.
      .reduce<Restaurant[]>((acc, r) => {
        const key = `${r.name.toLowerCase()}|${r.address ?? ""}`;
        if (!acc.some((x) => `${x.name.toLowerCase()}|${x.address ?? ""}` === key)) {
          acc.push(r);
        }
        return acc;
      }, [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 30);

    return NextResponse.json({
      ok: true,
      source: "openstreetmap",
      center: { lat, lng },
      results,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Overpass failed",
      },
      { status: 502 }
    );
  }
}

function priceFromTags(tags: Record<string, string>): string | undefined {
  // Some OSM data uses `price` / `cost` tags loosely. Map common values.
  const raw = (tags.price ?? tags["price:effective"] ?? "").toLowerCase();
  if (!raw) return undefined;
  if (/cheap|budget|low/.test(raw)) return "$";
  if (/mid|moderate|medium/.test(raw)) return "$$";
  if (/upscale|high|fine/.test(raw)) return "$$$";
  if (/luxury|premium|very high/.test(raw)) return "$$$$";
  return undefined;
}
