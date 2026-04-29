import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 86400; // holiday calendars are stable

// Public holidays via date.nager.at. Free, no key, ISO-2 country codes.
//   GET /api/intel/holidays?country=PT&from=2026-05-01&to=2026-05-10
//
// Returns: { ok, holidays: [{ date, name, localName, type, global }], country }
//
// We need a 2-letter country code. Callers can pass it directly; if they
// pass a country *name* via `?countryName=Portugal`, we map common ones.

const NAME_TO_ISO: Record<string, string> = {
  "united states": "US",
  "united kingdom": "GB",
  uk: "GB",
  france: "FR",
  germany: "DE",
  italy: "IT",
  spain: "ES",
  portugal: "PT",
  japan: "JP",
  china: "CN",
  india: "IN",
  mexico: "MX",
  canada: "CA",
  australia: "AU",
  brazil: "BR",
  argentina: "AR",
  iceland: "IS",
  morocco: "MA",
  thailand: "TH",
  netherlands: "NL",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  switzerland: "CH",
  austria: "AT",
  belgium: "BE",
  greece: "GR",
  ireland: "IE",
  poland: "PL",
  "south korea": "KR",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let country = searchParams.get("country")?.trim().toUpperCase();
  const countryName = searchParams.get("countryName")?.trim().toLowerCase();
  if (!country && countryName) {
    country = NAME_TO_ISO[countryName];
  }
  if (!country || country.length !== 2) {
    return NextResponse.json(
      { ok: false, error: "country (ISO-2) required" },
      { status: 400 }
    );
  }
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  // Date range fallback — current year + next year so the panel always has
  // something to show.
  const yearFrom = from
    ? new Date(from).getFullYear()
    : new Date().getFullYear();
  const yearTo = to ? new Date(to).getFullYear() : yearFrom + 1;
  const years = Array.from(
    { length: yearTo - yearFrom + 1 },
    (_, i) => yearFrom + i
  );

  try {
    const all: Holiday[] = [];
    for (const y of years) {
      const url = `https://date.nager.at/api/v3/PublicHolidays/${y}/${country}`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": "voyage-app",
          Accept: "application/json",
        },
        next: { revalidate: 86400 },
      });
      if (r.status === 404) continue;
      if (!r.ok) throw new Error(`nager ${r.status}`);
      const list = (await r.json()) as Holiday[];
      all.push(...list);
    }
    let filtered = all;
    if (from && to) {
      filtered = all.filter((h) => h.date >= from && h.date <= to);
    } else {
      // Otherwise return upcoming + recent past so the calendar feels alive.
      const now = new Date().toISOString().slice(0, 10);
      filtered = all
        .filter((h) => h.date >= now)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 12);
    }
    return NextResponse.json({ ok: true, country, holidays: filtered });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "nager failed",
      },
      { status: 502 }
    );
  }
}

type Holiday = {
  date: string;
  name: string;
  localName: string;
  countryCode: string;
  type: string;
  global: boolean;
};
