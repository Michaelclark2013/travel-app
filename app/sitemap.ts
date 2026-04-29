// Track F (SEO): the sitemap is the master index of crawlable URLs.
// Routes that are auth-gated (/profile, /messages, /trips, /wallet) are NOT
// listed here — those are blocked in robots.ts too.
//
// Mock-user profiles + canonical hashtag pages are emitted with a slightly
// lower priority since their content is seeded, not user-generated. Once
// real profiles + tags are in Supabase the data source swaps in here.

import type { MetadataRoute } from "next";
import { MOCK_USERS } from "@/lib/social";
import { canonicalTags, SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Static, public marketing surfaces.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, priority: 1.0, changeFrequency: "weekly", lastModified: now },
    { url: `${SITE_URL}/explore`, priority: 0.9, changeFrequency: "daily", lastModified: now },
    { url: `${SITE_URL}/inspire`, priority: 0.7, changeFrequency: "weekly", lastModified: now },
    { url: `${SITE_URL}/guides`, priority: 0.6, changeFrequency: "weekly", lastModified: now },
    { url: `${SITE_URL}/labs`, priority: 0.4, changeFrequency: "monthly", lastModified: now },
    { url: `${SITE_URL}/developers`, priority: 0.5, changeFrequency: "monthly", lastModified: now },
    // Track D · Pro upgrade landing page (added 2026-04-28).
    { url: `${SITE_URL}/pro`, priority: 0.8, changeFrequency: "monthly", lastModified: now },
    { url: `${SITE_URL}/legal/terms`, priority: 0.2, changeFrequency: "yearly", lastModified: now },
    { url: `${SITE_URL}/legal/privacy`, priority: 0.2, changeFrequency: "yearly", lastModified: now },
    { url: `${SITE_URL}/legal/cookies`, priority: 0.2, changeFrequency: "yearly", lastModified: now },
  ];

  // Mock user profiles. Lastmod is now() because the data is generated at
  // build time — no real createdAt exists yet.
  // Defensive: lib/social.ts is `"use client"`, so under Next 16 + Turbopack
  // the import can resolve to a stub module on the server build worker. Guard
  // with Array.isArray so a missing/undefined export degrades to an empty
  // sitemap section instead of a hard build failure.
  const mockUsers = Array.isArray(MOCK_USERS) ? MOCK_USERS : [];
  const userRoutes: MetadataRoute.Sitemap = mockUsers.map((u) => ({
    url: `${SITE_URL}/u/${u.username}`,
    priority: 0.6,
    changeFrequency: "weekly" as const,
    lastModified: now,
  }));

  // Canonical hashtag pages — see lib/seo.ts for the source list.
  const tagRoutes: MetadataRoute.Sitemap = canonicalTags().map((tag) => ({
    url: `${SITE_URL}/tag/${tag}`,
    priority: 0.5,
    changeFrequency: "daily" as const,
    lastModified: now,
  }));

  return [...staticRoutes, ...userRoutes, ...tagRoutes];
}
