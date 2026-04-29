// next.config.ts — Voyage Next.js 16 config.
// Track B (perf/a11y) added the `images` block: every remote host the app
// loads from now must be allowlisted as a `remotePatterns` URL so that
// `next/image` can proxy + optimize it. Add a domain here when you introduce
// a new image source. The `qualities` array is required by Next.js 16 — any
// `quality` prop we pass must match one of these allowed values.
import type { NextConfig } from "next";
import path from "node:path";

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
};

export default nextConfig;
