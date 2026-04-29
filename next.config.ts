// next.config.ts — Voyage Next.js 16 config.
// Track B (perf/a11y) added the `images` block: every remote host the app
// loads from now must be allowlisted as a `remotePatterns` URL so that
// `next/image` can proxy + optimize it. Add a domain here when you introduce
// a new image source. The `qualities` array is required by Next.js 16 — any
// `quality` prop we pass must match one of these allowed values.
import type { NextConfig } from "next";
import path from "node:path";

const SECURITY_HEADERS = [
  // Don't let attackers iframe Voyage to phish credentials.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none';" },
  // No MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak Voyage URLs to outbound clicks (we can still tag affiliate links).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Permissions-Policy locks browser APIs we don't use.
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=(self)", // we use it on /nearby
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()", // opt out of FLoC
    ].join(", "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this directory so the build doesn't pick up the
  // sibling lockfile in the parent (which inadvertently pulls in a
  // middleware.ts that lives outside this worktree).
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    qualities: [60, 75, 90],
    // Use the older object form (rather than the `new URL()` form) so the
    // hostname wildcards are clear at a glance.
    remotePatterns: [
      // Wikipedia / Wikimedia Commons photos served by LocationImage.
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.wikipedia.org",
        pathname: "/**",
      },
      // Unsplash search results served by LocationImage when the optional
      // NEXT_PUBLIC_UNSPLASH_ACCESS_KEY is configured.
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
        pathname: "/**",
      },
      // Vendor logos used in the trip wallet.
      {
        protocol: "https",
        hostname: "logo.clearbit.com",
        pathname: "/**",
      },
      // OpenStreetMap tiles / static maps used by the geocode/directions UIs.
      {
        protocol: "https",
        hostname: "**.tile.openstreetmap.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "staticmap.openstreetmap.de",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
