// app/api/status.json/route.ts — Track 6 JSON status feed.
//
// WHAT
//   GET /api/status.json
//     -> {
//          status: "ok" | "incident",
//          generated_at: ISO,
//          current: [...active public incidents],
//          recent: [...resolved public incidents in last 30d]
//        }
//
//   Designed for uptime monitors (Better Uptime, StatusCake, etc.) that
//   prefer JSON over RSS. Cache-Control allows 30s of edge caching to
//   absorb monitor polling spikes without hammering Postgres.
//
// AUTH
//   None — public endpoint.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY (to bypass RLS for the unauthenticated read).

import { getSupabaseAdmin } from "@/lib/supabase-server";

type Incident = {
  id: string;
  title: string;
  severity: "minor" | "major" | "critical";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  started_at: string;
  resolved_at: string | null;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  const supa = getSupabaseAdmin();
  const generated_at = new Date().toISOString();

  if (!supa) {
    return Response.json(
      {
        status: "ok",
        generated_at,
        current: [],
        recent: [],
        note: "Supabase not configured; treating as healthy.",
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=30",
        },
      }
    );
  }

  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const { data, error } = await supa
    .from("incidents")
    .select("id,title,severity,status,started_at,resolved_at")
    .eq("public", true)
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false });

  if (error) {
    return Response.json(
      { status: "unknown", generated_at, error: error.message },
      { status: 500 }
    );
  }

  const all = (data ?? []) as Incident[];
  const current = all.filter((i) => i.status !== "resolved");
  const recent = all.filter((i) => i.status === "resolved");

  return Response.json(
    {
      status: current.length === 0 ? "ok" : "incident",
      generated_at,
      current,
      recent,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=30",
      },
    }
  );
}
