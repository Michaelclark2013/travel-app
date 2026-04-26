import { NextResponse } from "next/server";
import { driveRoute, geocode, mapboxEnabled } from "@/lib/services/mapbox";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin") ?? "";
  const destination = searchParams.get("destination") ?? "";
  if (!origin || !destination) {
    return NextResponse.json(
      { error: "Missing origin or destination" },
      { status: 400 }
    );
  }

  if (!mapboxEnabled()) {
    return NextResponse.json({ source: "none" });
  }
  try {
    const [o, d] = await Promise.all([geocode(origin), geocode(destination)]);
    if (!o || !d) {
      return NextResponse.json({ source: "mapbox", error: "Could not geocode" });
    }
    const route = await driveRoute(o, d);
    return NextResponse.json({
      source: "mapbox",
      origin: o,
      destination: d,
      route,
    });
  } catch (err) {
    console.error("[directions]", err);
    return NextResponse.json({ source: "error" }, { status: 500 });
  }
}
