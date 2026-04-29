// Track F (SEO): server-rendered shell that hangs metadata + JSON-LD off the
// (otherwise client-only) trip detail page. The page itself stays "use client"
// so the existing trip-editing interactions don't have to change — this layout
// just adds <head> content and a <script type="application/ld+json"> tag.
//
// Note: the actual trip data lives in client localStorage, so we can't read
// the user's trip server-side without Supabase. We try Supabase first; if it
// can't see the row we ship sensible-but-generic metadata so the page still
// has a real <title>, og:title, etc. The opengraph-image.tsx in this same
// folder handles the image fall-through identically.

import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { abs, tripLd, SITE_URL } from "@/lib/seo";

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

type TripRow = {
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  vibes: string[] | null;
};

async function loadTripRow(id: string): Promise<TripRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const sb = createClient(url, anon);
    const { data } = await sb
      .from("trips")
      .select("destination,start_date,end_date,travelers,vibes")
      .eq("id", id)
      .maybeSingle();
    return (data as TripRow | null) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const row = await loadTripRow(id);
  const destination = row?.destination ?? "Trip";
  const title = row ? `${destination} trip` : "A trip on Voyage";
  const description = row
    ? `${row.travelers} traveler${row.travelers === 1 ? "" : "s"} · ${
        row.start_date
      } — ${row.end_date}${
        row.vibes && row.vibes.length ? ` · ${row.vibes.slice(0, 3).join(", ")}` : ""
      }. Planned in Voyage.`
    : "A trip planned in Voyage. Open it to see the day-by-day itinerary.";

  const url = abs(`/trips/${id}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "Voyage",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: "@voyageapp",
    },
  };
}

export default async function TripLayout({ params, children }: Props) {
  const { id } = await params;
  const row = await loadTripRow(id);
  // Only emit JSON-LD when we have real data; an empty TouristTrip is worse
  // than no schema at all.
  const ld = row
    ? tripLd({
        id,
        destination: row.destination,
        startDate: row.start_date,
        endDate: row.end_date,
        travelers: row.travelers,
        vibes: row.vibes ?? [],
      })
    : null;

  return (
    <>
      {ld ? (
        <script
          type="application/ld+json"
          // ld is JSON.stringified + script-close-stripped server-side; safe.
          dangerouslySetInnerHTML={{ __html: ld }}
        />
      ) : null}
      <link rel="canonical" href={`${SITE_URL}/trips/${id}`} />
      {children}
    </>
  );
}
