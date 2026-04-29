import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 1800; // 30 min CDN cache — weather changes slowly

// Real weather via Open-Meteo. Free, no API key required.
//   1. Geocode the city name → lat/lon (Open-Meteo geocoding API)
//   2. Forecast 7 days at that location (Open-Meteo forecast API)

type ForecastDay = {
  date: string;
  highC: number;
  lowC: number;
  conditions: string;
  precipMm: number;
};

const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Fog",
  51: "Drizzle",
  53: "Drizzle",
  55: "Drizzle",
  61: "Rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ hail",
  99: "Thunderstorm w/ hail",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get("city") ?? "").trim();
  const days = Math.min(14, Math.max(1, Number(searchParams.get("days") ?? 7)));
  if (!city) {
    return NextResponse.json({ error: "city required" }, { status: 400 });
  }

  try {
    // 1. Geocode
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl, { next: { revalidate: 86400 } });
    if (!geoRes.ok) throw new Error(`geocode ${geoRes.status}`);
    const geo = await geoRes.json();
    const place = geo?.results?.[0];
    if (!place) {
      return NextResponse.json(
        { ok: false, error: "City not found", city },
        { status: 404 }
      );
    }

    // 2. Forecast
    const fcUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=${days}&timezone=auto`;
    const fcRes = await fetch(fcUrl, { next: { revalidate: 1800 } });
    if (!fcRes.ok) throw new Error(`forecast ${fcRes.status}`);
    const fc = await fcRes.json();

    const out: ForecastDay[] = (fc?.daily?.time ?? []).map(
      (date: string, i: number) => ({
        date,
        highC: Math.round(fc.daily.temperature_2m_max[i]),
        lowC: Math.round(fc.daily.temperature_2m_min[i]),
        conditions: WMO[fc.daily.weather_code[i]] ?? "—",
        precipMm: Math.round(fc.daily.precipitation_sum[i] ?? 0),
      })
    );

    return NextResponse.json({
      ok: true,
      source: "open-meteo",
      city: place.name,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: fc.timezone,
      days: out,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Weather fetch failed",
      },
      { status: 502 }
    );
  }
}
