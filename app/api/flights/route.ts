import { NextResponse } from "next/server";
import {
  amadeusEnabled,
  searchFlights,
  type AmadeusFlight,
} from "@/lib/services/amadeus";
import { generateFlights } from "@/lib/mock-data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "JFK";
  const to = searchParams.get("to") ?? "NRT";
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const travelers = Number(searchParams.get("travelers") ?? 1);

  if (amadeusEnabled()) {
    try {
      const flights = await searchFlights({ from, to, date, travelers });
      if (flights.length > 0) {
        return NextResponse.json({ source: "amadeus", flights });
      }
    } catch (err) {
      console.error("[flights] Amadeus error, falling back to mock:", err);
    }
  }
  const flights: AmadeusFlight[] = generateFlights(from, to, date);
  return NextResponse.json({ source: "mock", flights });
}
