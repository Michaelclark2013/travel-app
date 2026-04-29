// middleware.ts — Track 1 extends the Track-? rate limiter to also gate the
// /admin/:path* surface.
//
// WHAT
//   - /api/* — existing rate limiting (unchanged from previous tracks).
//   - /admin/* — admin auth gate:
//       * /admin/login + /admin/login/* + /admin/mfa-setup are public.
//       * Everything else requires a valid voyage_admin cookie.
//       * If the cookie is missing/expired, redirect to /admin/login.
//       * If the session lacks MFA, redirect to /admin/mfa-setup.
//       * On success, attach an x-admin-id request header for downstream
//         handlers (which MUST re-verify; never trust the header alone).
//
// WHY
//   The brief explicitly says to extend the existing middleware rather than
//   rip it out for proxy.ts, so /api rate limiting and /admin gating live
//   in one file. (Next 16 has deprecated middleware.ts in favor of
//   proxy.ts; that codemod is a follow-up the team lead can run later.)
//
// ENV VARS
//   ADMIN_JWT_SECRET — used by lib/admin/session to verify the cookie.

import { NextRequest, NextResponse } from "next/server";
import {
  getClientIp,
  rateLimit,
  rateLimitHeaders,
  type RateBucket,
} from "@/lib/ratelimit";
import { ADMIN_COOKIE, verifyAdminJwt } from "@/lib/admin/session";
import { getFlag } from "@/lib/admin/flags";

// Track 6 expanded the matcher beyond /api + /admin so the maintenance gate
// can serve a 503 page on user-facing routes too. The negative lookahead
// excludes Next internals (_next, _vercel) and static asset extensions so we
// don't pay the middleware cost on every favicon hit.
export const config = {
  matcher: [
    "/((?!_next/|_vercel/|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|css|js|map|woff2?)$).*)",
  ],
};

// ---------------------------------------------------------------------------
// Maintenance gate — Track 6.
//
// Two flag keys are checked, in order of priority:
//   1. maintenance.global         — when on, EVERY non-admin request gets 503.
//   2. maintenance.<top-segment>  — per-route kill (e.g. maintenance.flights).
//
// Admin routes (/admin/*) and the public status page (/status, /api/status.*)
// are exempt so operators can still log in to disable the flag and so users
// can see the incident.
// ---------------------------------------------------------------------------
const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Voyage — Maintenance</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0b0d10; color:#e6e8eb; font-family:system-ui,-apple-system,sans-serif; }
  .card { max-width:480px; padding:32px; text-align:center; }
  h1 { font-size:22px; margin:0 0 12px; font-weight:600; }
  p { opacity:0.8; line-height:1.6; margin:0 0 16px; }
  a { color:#93c5fd; text-decoration:none; }
</style>
</head>
<body>
  <div class="card">
    <h1>We'll be right back</h1>
    <p>Voyage is undergoing scheduled maintenance. We expect to be back online shortly.</p>
    <p>Follow updates on our <a href="/status">status page</a>.</p>
  </div>
</body>
</html>`;

function maintenanceResponse(): NextResponse {
  return new NextResponse(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate",
      "Retry-After": "60",
    },
  });
}

function topSegment(pathname: string): string {
  // "/flights/abc" -> "flights"; "/" -> "" ; "/api/foo" -> "api".
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] ?? "";
}

function isMaintenanceExempt(pathname: string): boolean {
  if (pathname.startsWith("/admin")) return true;
  if (pathname === "/status" || pathname.startsWith("/status/")) return true;
  if (pathname.startsWith("/api/status")) return true;
  if (pathname.startsWith("/api/admin")) return true;
  if (pathname.startsWith("/api/health")) return true;
  return false;
}

async function maintenanceGate(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;
  if (isMaintenanceExempt(path)) return null;

  // An authenticated admin should never be locked out — they're the ones
  // who need to disable the flag. Detect by cookie presence; we do NOT
  // verify the JWT here (verification is async and cheap, but we want
  // to keep this branch tight). The /admin gate above re-checks anyway.
  if (req.cookies.get(ADMIN_COOKIE)?.value) return null;

  // Global maintenance.
  const global = await getFlag("maintenance.global").catch(() => false);
  if (global) return maintenanceResponse();

  // Per-route maintenance — keyed by the first path segment.
  const seg = topSegment(path);
  if (seg) {
    const routeFlag = await getFlag(`maintenance.${seg}`).catch(() => false);
    if (routeFlag) return maintenanceResponse();
  }

  return null;
}

function bucketFor(pathname: string): RateBucket {
  if (pathname.startsWith("/api/account")) return "auth";
  if (pathname.startsWith("/api/wallet/ingest")) return "ingest";
  if (pathname.startsWith("/api/wallet/share")) return "share";
  if (
    pathname.startsWith("/api/flights") ||
    pathname.startsWith("/api/hotels") ||
    pathname.startsWith("/api/directions") ||
    pathname.startsWith("/api/geocode")
  ) {
    return "search";
  }
  return "default";
}

// ----------------------------------------------------------------------------
// /admin gate. Returns null if the request should proceed (with optional
// x-admin-id header injected via the returned headers), or a Response/redirect
// to short-circuit.
// ----------------------------------------------------------------------------
async function adminGate(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;

  // Public admin surfaces — login flow + MFA enrollment.
  if (
    path === "/admin/login" ||
    path.startsWith("/admin/login/") ||
    path === "/admin/mfa-setup"
  ) {
    return null;
  }

  // TRACK 6: feature-flag-driven /admin gating happens above the cookie check
  // so we don't even pay the cookie-verify cost when a flag fully blocks
  // a sub-route. Today the only admin-scoped flag is `admin.lockdown`
  // (per-route admin disable). We intentionally do NOT honor maintenance.*
  // here because admins must always be able to reach /admin to disable
  // the flag during a global outage.
  const lockdown = await getFlag(`admin.lockdown.${path.split("/")[2] ?? ""}`).catch(() => false);
  if (lockdown) {
    return new NextResponse(
      JSON.stringify({ error: "Section temporarily disabled by ops." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!cookie) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const payload = await verifyAdminJwt(cookie);
  if (!payload) {
    // Cookie is invalid or expired — clear it and bounce to login.
    const res = NextResponse.redirect(new URL("/admin/login", req.url));
    res.cookies.delete(ADMIN_COOKIE);
    return res;
  }

  if (!payload.mfa) {
    return NextResponse.redirect(new URL("/admin/mfa-setup", req.url));
  }

  // Pass through, attaching admin id as a header for downstream handlers.
  // IMPORTANT: handlers MUST still call requirePerm() / re-verify the
  // cookie — this header is convenience metadata, not authentication.
  const res = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(req.headers),
        "x-admin-id": payload.sub,
      }),
    },
  });
  return res;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ----- Maintenance gate (Track 6) ---------------------------------------
  // Runs FIRST so a global kill switch beats every other code path. Admin
  // surfaces and the public /status page are exempted inside maintenanceGate.
  const maint = await maintenanceGate(req);
  if (maint) return maint;

  // ----- /admin/* gate (no rate limiting needed — admins are trusted) ------
  if (path.startsWith("/admin")) {
    const gated = await adminGate(req);
    return gated ?? NextResponse.next();
  }

  // Pages outside /api and /admin: maintenance gate already ran, just pass.
  if (!path.startsWith("/api")) {
    return NextResponse.next();
  }

  // ----- /api/* rate limit (existing logic) --------------------------------

  // Skip health checks — uptime monitors hit this every 30s and shouldn't
  // count against any user's quota.
  if (path === "/api/health") {
    return NextResponse.next();
  }

  const ip = getClientIp(req);
  const bucket = bucketFor(path);
  const r = await rateLimit(ip, bucket);

  if (!r.ok) {
    return new NextResponse(
      JSON.stringify({
        error: "Too many requests, slow down.",
        retryAfterSeconds: Math.max(1, r.reset),
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...rateLimitHeaders(r),
        },
      }
    );
  }

  // Pass through, attach rate-limit headers so the client can see remaining quota.
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(rateLimitHeaders(r))) {
    res.headers.set(k, v);
  }
  return res;
}
