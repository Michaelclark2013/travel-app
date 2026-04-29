# SEO_NOTES — Track F handoff

Owner: Track F (SEO/OG/Discoverability). Last revised 2026-04-28.

This document captures everything an operator needs to (a) verify the site
in Google Search Console, (b) submit the sitemap, and (c) sanity-check the
Open Graph / Twitter Card / structured-data layers Track F shipped.

Production URL used for canonical tags: `https://travel-app-tan-gamma.vercel.app`
(override per-environment with `NEXT_PUBLIC_SITE_URL`).

---

## 1. Google Search Console — verify the site

1. Go to https://search.google.com/search-console.
2. Click **Add property → Domain** (preferred) or **URL prefix**.
3. For the **Domain** option, enter the apex (e.g. `voyage.app`). Search
   Console will show a TXT record like `google-site-verification=…`.
4. Add that TXT record at the DNS provider:
   - **Vercel**: Project → Settings → Domains → DNS Records → Add Record
     (Type `TXT`, Name `@`, Value the full token).
   - **Cloudflare / Route53**: same idea — Type `TXT`, Host `@`.
5. Wait 5–10 minutes for propagation, then click **Verify** in Search Console.
6. If using **URL prefix** with the staging URL
   (`https://travel-app-tan-gamma.vercel.app`) instead, the easier path is the
   "HTML tag" method: copy the `<meta name="google-site-verification" …>`
   tag, paste it into `app/layout.tsx`'s `metadata.verification.google`
   field, redeploy, and verify.

## 2. Submit the sitemap

1. After verification, go to **Sitemaps** in the left nav.
2. Submit `sitemap.xml` (the path under your verified domain, no leading slash).
   Next.js serves it from `app/sitemap.ts` automatically.
3. Confirm the submission shows the expected number of URLs:
   - 9 static routes (`/`, `/explore`, `/inspire`, `/guides`, `/labs`,
     `/developers`, `/pro`, plus `/legal/*`).
   - 8 mock-user profiles under `/u/<username>` (one per `MOCK_USERS` row).
   - ~30+ `/tag/<name>` pages (curated list in `lib/seo.ts`).
4. Re-submit any time `lib/social.ts` (`MOCK_USERS`) or `lib/seo.ts`
   (`canonicalTags`) is updated; the sitemap regenerates on every deploy
   but Search Console crawls on its own cadence.

## 3. robots.txt

`app/robots.ts` allows everything under `/` except auth-gated personal data
(`/profile/`, `/messages/`, `/wallet/`, `/points/`, `/receipts/`, `/sos/`,
`/sign-in`, `/sign-up`) and the API root (`/api/`). It also explicitly opts
in/out of the major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, CCBot,
Google-Extended). Adjust there if/when policy changes.

## 4. Open Graph & Twitter Cards — manual verification

After deploying:

1. **Facebook / Open Graph debugger** —
   https://developers.facebook.com/tools/debug/ — paste a `/trips/<id>`,
   `/u/<username>`, or `/tag/<name>` URL. The card should show the
   per-route image rendered by `opengraph-image.tsx`. Click "Scrape Again"
   if Facebook caches an older preview.
2. **Twitter / X card validator** —
   https://cards-dev.twitter.com/validator (now mostly a no-op after X
   killed the dashboard, but the metadata is still consumed at post time).
   Paste any URL; verify `twitter:card = summary_large_image` appears in
   the response.
3. **iMessage / Slack / Discord** — easiest sanity test. Drop a link in any
   of these clients; the rich preview should render the per-route OG image
   within ~3 seconds.

## 5. Structured-data verification

Use https://search.google.com/test/rich-results to validate:

- `/` → expect a `WebSite` node + sitelinks-search-box hint.
- `/u/<username>` → `Person` node with name, alternateName, knowsAbout.
- `/trips/<id>` → `TouristTrip` node (only when Supabase has the row).
- `/pro` → two `Product` nodes (monthly + annual).
- `/tag/<name>` → `CollectionPage` node.

If any node is missing, check `lib/seo.ts` — every helper there serializes
its output via `jsonLd()`, which strips `</script` for safety.

## 6. Twitter handle placeholder

The Twitter `site` and `creator` handles in `app/layout.tsx` and per-route
metadata exports are set to `@voyageapp` as a **placeholder**. Once the
real marketing handle is registered, search-and-replace `@voyageapp`
across `app/` and `lib/seo.ts`.

## 7. Caveats / known gaps

- Per-trip OG image and `<title>` only render trip-specific content when
  Supabase is reachable from the server. Without it, both fall back to a
  generic gradient + "A trip on Voyage" copy. This is fine — user trips
  should not be globally indexed regardless.
- `/inspire` redirects to `/explore` server-side. We still list `/inspire`
  in the sitemap so legacy backlinks don't 404 in a crawl, but Search
  Console will report it as a 308.
- No `/api/v1/oembed` discovery via `<link>` from the trip page itself; the
  embed route's `<link rel="alternate">` is the canonical OEmbed entry.
  Consumers (Substack, WordPress) auto-discover from the iframe URL, which
  is the documented integration path on `/developers`.
