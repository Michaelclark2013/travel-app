import { NextResponse } from "next/server";
import {
  amadeusEnabled,
  searchHotels,
  type AmadeusHotel,
} from "@/lib/services/amadeus";
import { generateHotels } from "@/lib/mock-data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city") ?? "Tokyo";
  const checkIn =
    searchParams.get("checkIn") ?? new Date().toISOString().slice(0, 10);
  const checkOut =
    searchParams.get("checkOut") ??
    new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
  const travelers = Number(searchParams.get("travelers") ?? 1);

  if (amadeusEnabled()) {
    try {
      const hotels = await searchHotels({ city, checkIn, checkOut, travelers });
      if (hotels.length > 0) {
        return NextResponse.json({ source: "amadeus", hotels });
      }
    } catch (err) {
      console.error("[hotels] Amadeus error, falling back to mock:", err);
    }
  }
  const hotels: AmadeusHotel[] = generateHotels(city, checkIn);
  return NextResponse.json({ source: "mock", hotels });
}
