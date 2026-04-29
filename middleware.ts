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

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"],
};

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

  // TRACK 6: insert feature-flag evaluation here.
  // (Track 6 owns flag rollouts. Slot any /admin-scoped flag check between
  //  the public-route allow-list above and the cookie check below; keep it
  //  side-effect-free so this middleware stays Edge-runtime safe.)

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

  // ----- /admin/* gate (no rate limiting needed — admins are trusted) ------
  if (path.startsWith("/admin")) {
    const gated = await adminGate(req);
    return gated ?? NextResponse.next();
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
