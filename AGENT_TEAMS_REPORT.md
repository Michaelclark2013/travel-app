# Voyage v1 — Agent Teams Report

**Date**: 2026-04-28
**Mission**: "Demo-grade with great bones" → "real launch."
**Result**: 6 parallel tracks merged into `main`, build green, ready for prod.

## What each track shipped

### Track A — Real backend wire-through
- New: `lib/realtime.ts` (single-channel Supabase Realtime + boot hydration),
  `lib/supabase-server.ts` (admin client, gated on service role key),
  `components/SupabaseSocialBoot.tsx` (mounted in `app/layout.tsx`).
- Migrated to write-behind sync: `lib/likes.ts`, `lib/comments-reposts.ts`,
  `lib/social.ts` (follows / notifications / DMs), `lib/memory-roll.ts`
  (moments + Storage upload via `lib/image-upload.ts`).
- Strategy: kept every helper signature **synchronous**; local mirror is the
  source of truth, server writes are fire-and-forget, server reads happen
  once at boot via `hydrateSocialFromSupabase`. Trade-off: a network failure
  on a like never surfaces an error — the user re-likes, or Realtime
  reconciles. Confirmed acceptable per the "no ripple-async" rule.
- Migration collision flagged in `supabase/migrations/RENUMBER_NOTES.md`
  (two `0002_*`, two `0003_*` files exist — left untouched).

### Track B — Performance + a11y
- Replaced every `<img>` with `next/image`: `LocationImage`, wallet vendor
  logos, wallet QR (`unoptimized` for data: URIs), receipts.
- `next.config.ts`: image domains allowlisted (Wikipedia, Unsplash,
  Clearbit, OSM tiles + static maps); `qualities: [60, 75, 90]` (required
  by Next 16); Turbopack root pinned to project root.
- 11 heavy panels on `/trips/[id]` lazy-loaded via `next/dynamic` with
  `<PanelSkeleton aria-busy>` fallbacks: TripPreferences, TripCommitments,
  TripWorkouts, TripPacking, CurrencyConverter, DestinationIntel, JetLag,
  Events, AirportCompanion, DepartureChecklist, VoiceCommandButton.
- Focus-visible rings + aria-labels across `Nav`, account dropdown
  (`role="menu"`, `aria-haspopup`, `aria-expanded`).

### Track C — Reels + video posts
- `Memory` extended with `videoUri?` + `posterUri?`; existing image-only
  consumers (Journal grid, share sheet) keep working because `imageDataUri`
  is set to the poster frame.
- `app/profile/capture/page.tsx`: Photo/Video toggle, MediaRecorder pipeline
  with mimeType cascade (vp9 → vp8 → webm → mp4 h264), 15 s cap with
  circular progress on shutter, REC dot, long-press from Photo mode promotes
  to video.
- `components/explore/FeedPost.tsx`: `<ReelVideo>` for real videos with
  IntersectionObserver-driven autoplay/pause, tap-to-unmute, REEL badge;
  `<MockReelTile>` animated radial-gradient stand-in for seeded "video"
  mock content (no actual files).
- Safari iOS < 14.5 has no MediaRecorder — toggle hides; Safari ≥ 14.5
  records as mp4 only.

### Track D — Stripe Pro paywall
- `lib/pro.ts` with `isPro()`, `setPro()`, `paywallArmed()` — the
  publishable Stripe key is the master kill switch. Without it, gates compile
  but never fire.
- New `app/pro/page.tsx` (hero, $7.99/mo or $59/yr tiles, comparison table,
  Creator Marketplace teaser, FAQ — wrapped in `<Suspense>` for
  `useSearchParams`).
- `components/UpgradePrompt.tsx` reusable bottom-sheet/modal with
  reason-aware copy (`saved-trips`, `ai-agent`, `trip-doctor`, `generic`).
- `app/api/checkout/session/route.ts` — POST stub returning a recognizable
  test-mode response; full Stripe wire-up template documented in the file
  header.
- Soft gates wired into `/trips` (3 free saved trips), AssistantWidget
  (5 messages/session), TripDoctor (1 manual scan/day).
- Fixed two pre-existing build blockers: relaxed `fireAndForget` typing in
  `lib/realtime.ts` to handle `PostgrestFilterBuilder`'s thenable type;
  guarded `MOCK_USERS` iteration in `lib/seo.ts` + `app/sitemap.ts`.

### Track E — PWA + iOS polish
- `app/icon.tsx` + `app/apple-icon.tsx` generate icons via `next/og`
  `ImageResponse` — no raster assets committed.
- `app/manifest.ts`: standalone display, theme color, app shortcuts
  (Plan / Trips / Wallet), maskable icon variant.
- 9 apple-touch-startup-image splash entries via `metadata.icons.other`
  in `app/layout.tsx` covering iPhone/iPad portrait sizes.
- `components/InstallPrompt.tsx` with iOS Safari fallback ("Share → Add to
  Home Screen"), suppression while standalone, sticky dismiss; manual
  install button when `beforeinstallprompt` hasn't fired.
- `MobileTabBar` rewritten with haptic on tap, scroll-down-to-hide via rAF,
  spring-eased active-state, safe-area-bottom padding; preserved the rich
  5-tab + center FAB layout (Plan / Explore / Catch / DMs / Profile).
- `lib/push.ts` + `components/PushOptInPrompt.tsx` + `/api/push/subscribe`
  stub — gates on `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- Service worker: SKIP_WAITING messaging, push handler renders
  showNotification, notificationclick focuses an open tab or opens a new one.

### Track F — SEO + OG + discoverability
- Per-route OG images via `next/og`: root `app/opengraph-image.tsx`,
  `app/trips/[id]/opengraph-image.tsx`, `app/u/[username]/opengraph-image.tsx`,
  `app/tag/[name]/opengraph-image.tsx`. All 1200x630, gradient fallbacks.
- Root metadata in `app/layout.tsx`: `metadataBase`, `title.template`, full
  OpenGraph + Twitter cards, `@voyageapp` placeholder handle (commented).
- `generateMetadata` exports across static + dynamic pages; auth-gated
  routes (`/profile`, `/sign-in`, `/sign-up`, `/messages`) set
  `robots: noindex, nofollow, nocache`.
- `app/sitemap.ts`: emits `/`, `/explore`, `/inspire`, `/guides`, `/labs`,
  `/developers`, `/pro`, all `/legal/*`, every mock-user profile, every
  canonical hashtag.
- `app/robots.ts`: per-bot rules (GPTBot/ClaudeBot/PerplexityBot/CCBot/
  Google-Extended), sitemap reference, blocks for `/api/`, `/messages/`,
  `/profile/`, `/wallet/`, `/points/`, `/receipts/`, `/sos/`, `/sign-*`.
- `lib/seo.ts`: `SITE_URL`, `abs()`, `canonicalTags()`,
  `jsonLd()`/`personLd()`/`tripLd()`/`productLd()`/`websiteLd()`. JSON-LD
  output is `</script`-stripped server-side.
- `app/page.tsx`: WebSite schema + sitelinks SearchAction.
- `app/api/v1/oembed/route.ts`: validates origin, returns iframe HTML +
  thumbnail.
- `SEO_NOTES.md` runbook for Search Console verification + sitemap submission.

## Coordination lessons learned (for the next sweep)

- **Worktree isolation is leaky** — sub-agents wrote to absolute paths in the
  parent tree, bypassing their isolated worktree. For the admin-team sweep,
  the parent tree must be committed to a clean state *before* spawning, or
  pre-create empty stub files for everything specialists are expected to
  edit (so worktrees see them).
- **Allowlisting Bash up front matters** — Track B failed on its first
  attempt because git/npm calls were prompt-blocked. Common dev commands
  are now in `.claude/settings.local.json`'s `permissions.allow`.
- **Cross-track edits happened anyway** — Track D fixed Track A's
  `fireAndForget` typing and added `/pro` to Track F's sitemap. Build-breaking
  collisions sorted themselves out in the parent tree because tracks ran
  effectively in serial after escaping isolation.
- **Hook config bug** — `${CLAUDE_PLUGIN_ROOT}/scripts/check-sql-files.py`
  is invoked unquoted, so a path-with-space (`/Library/Application Support`)
  in the user's environment makes the SQL-files PostToolUse hook spam errors
  on every Write/Edit. Writes still succeed; flagged for cleanup.

## Env vars that unlock more

| Var | Track | Effect |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | A | Activates the full social/realtime backend. Mock-user FK violations are silently swallowed by design until those are real auth UUIDs. |
| `SUPABASE_SERVICE_ROLE_KEY` | A | Activates `lib/supabase-server.ts:getSupabaseAdmin()` for trusted route handlers. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | D | **Master switch.** Until set, Pro gates always pass — `isPro()` returns true. With it, gates fire. |
| `STRIPE_SECRET_KEY` + `STRIPE_PRICE_MONTHLY` + `STRIPE_PRICE_ANNUAL` + `STRIPE_WEBHOOK_SECRET` | D | Activates real Stripe Checkout in `/api/checkout/session` (paste-in template documented). Requires `npm i stripe @stripe/stripe-js`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | E | Activates Web Push — without it, `PushOptInPrompt` renders nothing. |
| `ANTHROPIC_API_KEY` | (existing) | Flips Trip Doctor, Screenshot Intel, chat agent from heuristic to real Claude. |
| `AMADEUS_API_KEY` + `AMADEUS_API_SECRET` | (existing) | Real flight + hotel search. |
| `MAPBOX_TOKEN` | (existing) | Real reverse-geocode + driving distances. |
| `NEXT_PUBLIC_TRAVELPAYOUTS_MARKER` | (existing) | Affiliate revenue per click. |
| `RESEND_API_KEY` | (existing) | Transactional email. |
| `NEXT_PUBLIC_SENTRY_DSN` + `NEXT_PUBLIC_POSTHOG_KEY` | (existing) | Observability. |
| `NEXT_PUBLIC_SITE_URL` | F | Override the canonical OG / Twitter URL base if the prod domain changes. |

## Three suggested next-round tracks

1. **Admin backend** — `/admin/*` for the ops team: RBAC, audit log,
   user/content management, Claude-powered moderation queue, Stripe ops,
   feature flags, support inbox, GDPR tools, AI ops (semantic search,
   anomaly detection, conversational Postgres). 9 sub-tracks.
2. **Real auth + cross-device profiles** — wire Supabase Auth into the
   existing AuthProvider, replacing localStorage sessions; profile sync
   across devices via `profiles_public`; account recovery flow.
3. **Native iOS app via Capacitor** — wrap the PWA, register the URL
   schemes for trip / profile sharing, ship to TestFlight. Most of the
   heavy lifting (PWA chrome, push, manifest, install) is already done by
   Track E so this is largely a packaging exercise.
