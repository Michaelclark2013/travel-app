import { NextResponse } from "next/server";
import { scanTrip } from "@/lib/services/trip-doctor";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { trip?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.trip) {
    return NextResponse.json({ error: "missing 'trip'" }, { status: 400 });
  }
  // Pass a compact JSON string — keeps token use down.
  const tripJson = JSON.stringify(body.trip);
  if (tripJson.length > 30_000) {
    return NextResponse.json(
      { error: "Trip too large to analyze. Trim itinerary." },
      { status: 413 }
    );
  }
  try {
    const result = await scanTrip({ tripJson });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[trip-doctor]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Doctor scan failed",
      },
      { status: 502 }
    );
  }
}
