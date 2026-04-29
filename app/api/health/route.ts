import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Lightweight health-check + integration status — used by uptime monitors.
// Lists which integrations are wired (env-var detection only — doesn't make
// outbound calls).
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "voyage",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    timestamp: new Date().toISOString(),
    integrations: {
      supabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      amadeus: !!(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET),
      mapbox: !!process.env.MAPBOX_TOKEN,
      affiliates: !!process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER,
      sentry: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      analytics: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
      ratelimit: !!(process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN),
      email: !!process.env.RESEND_API_KEY,
    },
  });
}
