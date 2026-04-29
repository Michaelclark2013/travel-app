// Track F (SEO): shared helpers for canonical URLs, JSON-LD, and the
// curated hashtag list used by the sitemap.
//
// Why this file exists:
//   - All other Track F pieces (sitemap, generateMetadata, OG image routes,
//     /tag pages) need a single source of truth for the production URL and
//     for the list of crawlable hashtags. Keeping them here avoids drift.
//   - The JSON-LD helpers return plain strings ready to drop into a
//     <script type="application/ld+json"> tag on a server-rendered layout.
//     They never take untrusted user input from a request — only data we
//     already render visibly on the page — so escape rules below are minimal
//     (we still strip </script> as a defense-in-depth measure).

import { MOCK_USERS } from "@/lib/social";
import { extractTags } from "@/lib/markup";

/** Canonical site URL. Used everywhere we need an absolute link. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://travel-app-tan-gamma.vercel.app";

/** Build an absolute URL from a path; safe for trailing-slash variants. */
export function abs(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}

/**
 * Curated hashtag set we want indexable. Combines:
 *   1. Every #tag the mock users have used in their captions / locations.
 *   2. A baked-in list of high-value travel keywords so /tag/<keyword>
 *      always has a discoverable URL even if no mock user happened to use it.
 *
 * Once user-generated content lives in Supabase this becomes a query of the
 * top-N tags by post-count, but the public surface stays identical.
 */
export function canonicalTags(): string[] {
  const baked = [
    "travel",
    "wanderlust",
    "foodie",
    "solotravel",
    "citybreak",
    "beachlife",
    "mountains",
    "japan",
    "italy",
    "portugal",
    "mexico",
    "thailand",
    "iceland",
    "tokyo",
    "rome",
    "lisbon",
    "newyork",
    "paris",
    "barcelona",
    "cdmx",
  ];
  const fromMocks = new Set<string>();
  // Defensive: lib/social.ts is "use client" and under Next 16 + Turbopack
  // its exports can be undefined when imported from a server-only context.
  // Skip the seed-tag pass cleanly in that case.
  const mockUsers = Array.isArray(MOCK_USERS) ? MOCK_USERS : [];
  for (const u of mockUsers) {
    for (const m of u.moments) {
      for (const t of extractTags(`${m.caption} ${m.location}`)) {
        fromMocks.add(t);
      }
    }
  }
  return [...new Set([...baked, ...fromMocks])].sort();
}

// ---------------------------------------------------------------------------
// JSON-LD helpers — every helper returns a STRING already JSON.stringify'd
// and run through stripScriptClose() so it can be dropped into a
// <script type="application/ld+json"> as `dangerouslySetInnerHTML`.
//
// We always render JSON-LD server-side (never inside a "use client" file) so
// the structured data ships in the initial HTML for crawlers like Googlebot
// and Bingbot that don't run client-side React. See SEO_NOTES.md.

function stripScriptClose(s: string): string {
  // Defense in depth — we never embed untrusted user input here, but if a
  // future caller ever does, this neuters the </script> escape vector.
  return s.replace(/<\/script/gi, "<\\/script");
}

export function jsonLd<T extends Record<string, unknown>>(obj: T): string {
  return stripScriptClose(JSON.stringify(obj));
}

/** schema.org/Person — used on /u/[username]. */
export function personLd(opts: {
  name: string;
  username: string;
  bio?: string;
  followers?: number;
  travelStyles?: string[];
}): string {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "Person",
    name: opts.name,
    alternateName: `@${opts.username}`,
    url: abs(`/u/${opts.username}`),
    description: opts.bio,
    knowsAbout: opts.travelStyles ?? [],
    interactionStatistic: opts.followers
      ? {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/FollowAction",
          userInteractionCount: opts.followers,
        }
      : undefined,
  });
}

/** schema.org/TouristTrip — used on /trips/[id]. */
export function tripLd(opts: {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  vibes?: string[];
}): string {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: `${opts.destination} trip`,
    description: `A ${opts.travelers}-traveler trip to ${opts.destination}${
      opts.vibes && opts.vibes.length ? ` (${opts.vibes.join(", ")})` : ""
    }, planned in Voyage.`,
    url: abs(`/trips/${opts.id}`),
    itinerary: {
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "Place",
          name: opts.destination,
        },
      ],
    },
    startDate: opts.startDate,
    endDate: opts.endDate,
    touristType: opts.vibes ?? [],
    provider: {
      "@type": "Organization",
      name: "Voyage",
      url: SITE_URL,
    },
  });
}

/** schema.org/Product — used on /pro when the upgrade page exists. */
export function productLd(opts: {
  name: string;
  description: string;
  url: string;
  priceUsd: number;
  recurrence?: "P1M" | "P1Y";
}): string {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    brand: { "@type": "Brand", name: "Voyage" },
    offers: {
      "@type": "Offer",
      price: opts.priceUsd.toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: opts.url,
      ...(opts.recurrence
        ? { eligibleDuration: { "@type": "QuantitativeValue", value: opts.recurrence } }
        : {}),
    },
  });
}

/** schema.org/WebSite — typically rendered on the home page. */
export function websiteLd(): string {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Voyage",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/explore?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  });
}
