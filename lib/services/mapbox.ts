// Server-side Mapbox helpers. Geocoding (city → coords) and Directions (real
// driving distance + duration). Sign up: https://mapbox.com (100K req/mo free).
// Set MAPBOX_TOKEN on Vercel.

const GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox/driving";

export function mapboxEnabled(): boolean {
  return !!process.env.MAPBOX_TOKEN;
}

export type Coords = { lat: number; lng: number; label: string };

export async function geocode(query: string): Promise<Coords | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const url = `${GEOCODE_URL}/${encodeURIComponent(query)}.json?limit=1&access_token=${token}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    features?: { center: [number, number]; place_name: string }[];
  };
  const f = data.features?.[0];
  if (!f) return null;
  return { lng: f.center[0], lat: f.center[1], label: f.place_name };
}

export type DriveRoute = {
  miles: number;
  durationMinutes: number;
};

export async function driveRoute(
  origin: Coords,
  destination: Coords
): Promise<DriveRoute | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${DIRECTIONS_URL}/${coords}?overview=false&access_token=${token}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    routes?: { distance: number; duration: number }[];
  };
  const r = data.routes?.[0];
  if (!r) return null;
  return {
    miles: Math.round(r.distance / 1609.344),
    durationMinutes: Math.round(r.duration / 60),
  };
}
