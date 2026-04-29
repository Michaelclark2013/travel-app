import { NextRequest, NextResponse } from "next/server";
import {
  getClientIp,
  rateLimit,
  rateLimitHeaders,
  type RateBucket,
} from "@/lib/ratelimit";

export const config = {
  // Apply to every API route. Health check stays public + unmetered.
  matcher: ["/api/:path*"],
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

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

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
