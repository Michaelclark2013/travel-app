import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Public, read-only trip data — anonymized. Only trips with `share_token` set
// are accessible. Real implementation should require a token query param;
// this v1 endpoint returns 404 for unknown ids.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json(
      { error: "Public trip API requires Supabase to be configured." },
      { status: 501 }
    );
  }
  const sb = createClient(url, anon);
  const { data, error } = await sb
    .from("trips")
    .select(
      "id,destination,origin,start_date,end_date,travelers,intent,vibes,itinerary,transport_mode,created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      id: data.id,
      destination: data.destination,
      origin: data.origin,
      startDate: data.start_date,
      endDate: data.end_date,
      travelers: data.travelers,
      intent: data.intent,
      vibes: data.vibes,
      transportMode: data.transport_mode,
      itinerary: data.itinerary,
      source: "voyage",
    },
    { headers: { "access-control-allow-origin": "*" } }
  );
}
