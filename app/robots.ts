// Track F (SEO): tells crawlers which routes are public + where the sitemap
// lives. The previous version disallowed /trips/ wholesale — but trips have
// public share URLs (/trips/<id> renders an OG card via Track F's
// opengraph-image), so that's now allowed. Personal surfaces (/profile,
// /messages, /wallet, /points, /sign-*) stay blocked because they're either
// auth-gated or contain personal data we never want indexed.

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/messages/",
          "/profile/",
          "/wallet/",
          "/points/",
          "/sign-in",
          "/sign-up",
          // /receipts and /sos contain personal data — keep them out.
          "/receipts/",
          "/sos/",
        ],
      },
      // Be explicit with AI crawlers — same policy as web crawlers. Listed
      // separately so future overrides are a one-line change.
      {
        userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "CCBot", "Google-Extended"],
        allow: "/",
        disallow: [
          "/api/",
          "/messages/",
          "/profile/",
          "/wallet/",
          "/points/",
          "/receipts/",
          "/sos/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
