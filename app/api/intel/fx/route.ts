import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600; // 1h FX cache

// Real FX rates via open.er-api.com (free, no key, MIT-licensed dataset).
//   GET /api/intel/fx?base=USD
// Returns rates keyed by ISO currency code.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = (searchParams.get("base") ?? "USD").toUpperCase();
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`fx ${res.status}`);
    const data = (await res.json()) as {
      result: string;
      base_code: string;
      rates: Record<string, number>;
      time_last_update_unix: number;
    };
    if (data.result !== "success") {
      throw new Error("FX API returned non-success");
    }
    return NextResponse.json({
      ok: true,
      source: "open.er-api",
      base: data.base_code,
      rates: data.rates,
      asOf: new Date(data.time_last_update_unix * 1000).toISOString(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "FX fetch failed",
      },
      { status: 502 }
    );
  }
}
