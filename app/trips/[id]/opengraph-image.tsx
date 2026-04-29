// Track F (SEO): per-trip Open Graph card. Renders 1200x630 social preview
// when someone pastes a trip URL into iMessage / Slack / Twitter / Discord.
//
// Why a server image:
//   - Trip data lives in client localStorage today, so we can't read the
//     specific user's trip server-side. We try Supabase first (the same
//     read used by /api/v1/embed/[id]) and gracefully fall back to a
//     destination-agnostic gradient with the trip ID — which still beats
//     the generic root OG card because it tells the link recipient this
//     is a Voyage trip, not the homepage.
//   - When the user-trip table is fully wired we just remove the fallback
//     branch.

import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const alt = "A trip planned in Voyage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type TripMeta = {
  destination?: string;
  startLabel?: string;
  endLabel?: string;
  travelers?: number;
  vibes?: string[];
  days?: number;
};

async function tryLoadTrip(id: string): Promise<TripMeta | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const sb = createClient(url, anon);
    const { data } = await sb
      .from("trips")
      .select("destination,start_date,end_date,travelers,vibes,itinerary")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      destination: data.destination as string,
      startLabel: formatDate(data.start_date as string),
      endLabel: formatDate(data.end_date as string, true),
      travelers: data.travelers as number,
      vibes: (data.vibes as string[]) ?? [],
      days: Array.isArray(data.itinerary) ? data.itinerary.length : 0,
    };
  } catch {
    return null;
  }
}

function formatDate(iso: string, withYear = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export default async function OG({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = await tryLoadTrip(id);
  const destination = trip?.destination ?? "Your next trip";
  const dateRange =
    trip?.startLabel && trip?.endLabel
      ? `${trip.startLabel} — ${trip.endLabel}`
      : "Voyage trip";
  const vibes = (trip?.vibes ?? []).slice(0, 4).join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(circle at 80% 0%, rgba(34,211,238,0.18), transparent 60%), radial-gradient(circle at 0% 100%, rgba(167,139,250,0.18), transparent 60%), #07080d",
          color: "#e8eaf0",
          display: "flex",
          flexDirection: "column",
          padding: "80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 22,
            letterSpacing: "0.18em",
            fontWeight: 600,
            color: "#22d3ee",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              background: "rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#22d3ee",
              fontWeight: 800,
            }}
          >
            V
          </div>
          <div style={{ color: "#e8eaf0" }}>VOYAGE · TRIP</div>
        </div>

        <div
          style={{
            marginTop: "auto",
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>{destination}</span>
          <span style={{ color: "#22d3ee", fontSize: 40, fontWeight: 500 }}>
            {dateRange}
          </span>
        </div>

        <div
          style={{
            marginTop: 28,
            display: "flex",
            gap: 20,
            fontSize: 22,
            color: "#8a90a3",
          }}
        >
          {trip?.days ? <span>{trip.days} days</span> : null}
          {trip?.travelers ? (
            <span>
              {trip.travelers} traveler{trip.travelers === 1 ? "" : "s"}
            </span>
          ) : null}
          {vibes ? <span>{vibes}</span> : null}
        </div>
      </div>
    ),
    size
  );
}
