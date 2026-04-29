import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 86400; // country data is essentially static

// Real country data via REST Countries (free, no key).
//   GET /api/intel/country?name=Japan
//
// Returns currency, languages, capital, region, timezones, plug type via
// fallback table, calling code, drives-on side, flag emoji. The REST
// Countries response is chatty so we project to a tight shape the UI uses.

const PLUG_BY_COUNTRY: Record<string, string[]> = {
  Japan: ["A", "B"],
  Portugal: ["C", "F"],
  Mexico: ["A", "B"],
  Iceland: ["C", "F"],
  Morocco: ["C", "E"],
  Argentina: ["C", "I"],
  France: ["C", "E"],
  Italy: ["C", "F", "L"],
  "United Kingdom": ["G"],
  "United States": ["A", "B"],
  Spain: ["C", "F"],
  Germany: ["C", "F"],
  Australia: ["I"],
  "New Zealand": ["I"],
  India: ["C", "D", "M"],
  Thailand: ["A", "B", "C", "O"],
  Brazil: ["C", "N"],
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  try {
    const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fields=name,capital,region,subregion,languages,currencies,timezones,flag,car,idd,maps,population`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`restcountries ${res.status}`);
    const arr = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(arr) || arr.length === 0) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    // Pick the closest match: an exact common-name match if present.
    const exact = arr.find(
      (c) =>
        ((c.name as { common?: string })?.common ?? "").toLowerCase() ===
        name.toLowerCase()
    );
    const c = (exact ?? arr[0]) as {
      name: { common: string; official: string };
      capital?: string[];
      region?: string;
      subregion?: string;
      languages?: Record<string, string>;
      currencies?: Record<string, { name: string; symbol: string }>;
      timezones?: string[];
      flag?: string;
      car?: { side?: "left" | "right" };
      idd?: { root?: string; suffixes?: string[] };
      maps?: { googleMaps?: string };
      population?: number;
    };

    const currencies = Object.entries(c.currencies ?? {}).map(
      ([code, def]) => ({
        code,
        name: def.name,
        symbol: def.symbol,
      })
    );
    const languages = Object.values(c.languages ?? {});
    const callingCode =
      (c.idd?.root ?? "") + (c.idd?.suffixes?.[0] ?? "");

    return NextResponse.json({
      ok: true,
      source: "restcountries",
      country: c.name.common,
      official: c.name.official,
      capital: c.capital?.[0],
      region: c.region,
      subregion: c.subregion,
      languages,
      currencies,
      timezones: c.timezones,
      flag: c.flag,
      drivingSide: c.car?.side ?? "right",
      callingCode,
      population: c.population,
      mapsUrl: c.maps?.googleMaps,
      plugTypes: PLUG_BY_COUNTRY[c.name.common] ?? [],
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Country fetch failed",
      },
      { status: 502 }
    );
  }
}
