# Voyage Admin Backend — Agent Teams Report

**Date**: 2026-04-29
**Mission**: "Operate at scale" — full /admin backend covering ops,
moderation, monetization, support, compliance, and AI tooling.
**Result**: 9 tracks merged into main, build green, deployed to prod.

## What each track shipped

### Track 1 — Admin auth, RBAC, audit log (foundation)
- Migration `0010_admin.sql`: `admin_roles`, `admin_audit` (append-only
  via UPDATE/DELETE-blocking triggers + jsonb validation),
  `admin_invites`. RLS revokes everything from anon/authenticated —
  service role only.
- `lib/admin/rbac.ts`: 5 roles (super_admin, admin, support, finance,
  viewer), permission matrix, `hasPerm()`, `requirePerm(req, perm)`.
- `lib/admin/session.ts`: HS256 JWT via Web Crypto so it runs unchanged
  in Edge middleware + route handlers + Server Components.
- `lib/admin/mfa.ts`: RFC 6238 TOTP, custom RFC 4648 base32 codec,
  AES-256-GCM at-rest secret encryption seeded off `ADMIN_JWT_SECRET`.
- `lib/admin/audit.ts`: `audit(action, target, diff, fn)` wraps
  mutations, captures admin/IP/UA via next/headers, writes intent +
  outcome rows.
- `/admin/login` (magic link via Resend) → `/admin/login/verify` →
  `/admin/mfa-setup` (inline-SVG QR via existing `qrcode-generator`)
  → `/admin`.
- `middleware.ts`: extended to gate `/admin/*` and attach `x-admin-id`.
- `/admin/audit`: filterable cursor-paginated viewer with side-by-side
  JSON diff (zero-deps line-by-line position diff).

### Track 2 — User + content management
- Migration `0011_admin_users_content.sql`: `deleted_at` / `hidden_at`
  / `featured_at` columns on `profiles_public` / `moments` / `trips`
  (+ on `comments`); new `admin_bulk_jobs` table.
- `/admin/users`: virtual-scrolled, debounced full-text search, cursor
  pagination, bulk-action bar.
- `/admin/users/[id]`: identity, UA-deduped device list, content
  counts, ban + Pro state, full action panel.
- 8 audit-logged action APIs: suspend/restore, force sign-out, reset
  password, soft-delete, comp Pro, etc.
- Impersonation: 30-min HS256 cookie + `<ImpersonationBanner>` mounted
  in `app/layout.tsx`.
- `/admin/content`: tabs for Moments / Trips / Comments / DMs (DMs
  require typed reason; every page-view audited).
- `lib/admin/bulk.ts`: 1k-row engine, batches of 50, resumable,
  cancelable, dispatches to per-kind handlers.

### Track 3 — Moderation + Trust & Safety
- Migration `0012_moderation.sql`: `moderation_queue`,
  `abuse_reports`, `pattern_bans`. Trigger DDL ships **commented** —
  ops needs to enable `pg_net` and put the function URL in Vault.
- `lib/admin/moderation.ts`: Claude classifier with forced
  `record_classification` tool, 7 categories, in-process LRU.
- `lib/admin/patterns.ts`: deterministic ban evaluator
  (content_hash → keyword_regex → ip → ip_range → fingerprint →
  phash) with 30s cache.
- `lib/admin/phash.ts`: pure-JS perceptual hash via DCT + 32×32
  grayscale + 8×8 low-freq → 16-hex.
- `/admin/moderation`: tabbed queue, score chips, action buttons,
  Realtime live updates.
- `/admin/moderation/sweep/[userId]`: bounded worker pool (cap 5),
  batch-classifies last 200 moments + comments.
- `/api/admin/transparency`: trailing-N-day CSV + JSON.
- `components/AbuseReportButton.tsx`: standalone widget, not yet wired
  into existing UI (drop-in for Track 7 or follow-up).

### Track 4 — Analytics + metrics dashboard
- Migration `0013_metrics.sql`: 6 service-role-only RPCs
  (`get_dau_wau_mau`, `get_retention_cohort`, `get_funnel`,
  `get_geo_split`, `get_device_split`, `get_concurrent_sessions`),
  plus `analytics_events` and `metric_cards` tables, plus a
  whitelist-validated `get_custom_metric`.
- `/admin/metrics`: server-rendered with React Suspense per card —
  slow query never gates the page.
- Zero-deps SVG charts: `Sparkline`, `Bars`, `FunnelChart`,
  `CohortTriangle`, `BigNumber`.
- `lib/admin/posthog-server.ts`: PostHog HogQL + saved-insight wrapper
  with Upstash 60s cache, in-memory fallback.
- `/admin/metrics/builder`: pick-table-filter-aggregation form;
  saves to `metric_cards`; cards render via the safe RPC.
- Concurrent-now panel via Realtime + 30s heartbeat.

### Track 5 — Financial admin (Stripe)
- Migration `0014_billing.sql`: `pro_entitlements`,
  `stripe_events` (idempotency), `affiliate_conversions`. Defense-in-
  depth `revoke insert/update/delete` on entitlements.
- `/api/stripe/webhook`: zero-dep, signature-verified (HMAC-SHA256
  via node:crypto, `timingSafeEqual`, 5min drift), idempotent, handles
  `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`,
  `charge.refunded`.
- `/admin/billing`: tabs (Active/Past Due/Canceled/Comps), MRR/ARR
  metrics, dunning queue.
- `/admin/billing/[customerId]`: full Stripe customer view with
  audit-wrapped comp / refund / coupon / cancel / retry actions.
- `lib/admin/stripe.ts`: fetch-based Stripe REST wrapper (no `stripe`
  npm package), Idempotency-Key support, typed minimal shapes.
- `/admin/billing/affiliates`: Travelpayouts conversions + monthly
  aggregates + CSV export.
- `lib/admin/tax.ts`: `taxFor(country)` for top 30 markets.
- `lib/pro-entitlement.ts` + `/api/me/pro`: server-anchored
  `useProEntitlement()` — existing `lib/pro.ts` localStorage gate
  intentionally untouched.

### Track 6 — Operations (flags, kill switches, maintenance, incidents)
- Migration `0015_ops.sql`: `feature_flags`, `incidents`,
  `incident_updates`. Public-incident SELECT for authenticated.
- `lib/admin/flags.ts`: edge-safe, 5s Upstash + in-memory cache,
  fetch-based PostgREST (no node: imports). Sync FNV-1a hash for the
  middleware hot path; async SHA-256 variant exported for callers
  with an async context.
- `middleware.ts`: maintenance gate runs first; honors
  `maintenance.global` + `maintenance.<top-segment>`; admins bypass via
  cookie. Filled the Track 1 "TRACK 6:" slot. Matcher widened to all
  non-asset routes so the global 503 catches `/`, `/explore`, etc.
- `/admin/flags`: list + filter + inline edit, kill-switch tab.
- `/admin/maintenance`: global + per-route toggles + 503 preview iframe.
- `/admin/incidents`: timeline editor, public/internal toggle.
- `/status`: public, no-auth status page (ISR 30s).
- `/api/status.json` + `/api/status.rss`: monitor-friendly feeds.
- `lib/admin/pricing-flag.ts`: helper for pricing experiments.

### Track 7 — Support inbox + outbound
- Migration `0016_support.sql`: `support_tickets`, `support_messages`,
  `outbound_campaigns`, `campaign_events`, `canned_replies`.
- `/api/support/contact` (public form, IP-rate-limited),
  `/api/support/inbound` (Resend HMAC-verified webhook, threads
  replies via `[tic-…]` subject reference, reopens resolved tickets).
- `/admin/inbox`: filtered + virtualized ticket list, SLA badges turn
  red when due.
- `/admin/inbox/[ticketId]`: threaded view, macros dropdown, **Draft
  with Claude** button (calls Anthropic with last 10 admin_audit rows
  for that user, returns 2-3 drafts split on `---`).
- `/admin/inbox/macros`: canned-replies CRUD.
- `/admin/campaigns/{push,email,banner}`: composers. Markdown
  hand-rolled subset. Email server-rendered live preview.
- Email fan-out via Resend; campaign_events tracked.
- Push/banner stubs flagged for follow-up (no server VAPID; banner
  reads from `outbound_campaigns` directly).

### Track 8 — Compliance, GDPR/CCPA
- Migration `0017_compliance.sql`: `dsar_requests`, `cookie_consents`,
  `retention_policies` (seeded), `dpa_documents`, plus private
  `exports` + `dpa-documents` storage buckets.
- `lib/zip.ts`: ~140-line zero-dep store-only ZIP encoder (CRC-32 +
  helpers); used to package DSAR exports.
- `/admin/compliance` + `[requestId]`: DSAR inbox + detail with
  build-export, dry-run erasure, typed-email confirm-erase, JSON
  receipt.
- DSAR export pipeline: profile + trips + moments + likes + comments
  + reposts + follows + dms + wallet + consent + audit refs → ZIP →
  Storage with 7-day signed URL → Resend email.
- DSAR erasure pipeline: hard-deletes content tables, soft-deletes
  profile, anonymizes audit_log refs (best-effort — append-only
  trigger silently rejects per legal carve-out), deletes auth.users.
- `/api/cron/retention`: daily 03:00 UTC purge per policy
  (CRON_SECRET-gated). Tolerates table-missing errors.
- `components/CookieConsent.tsx` + `lib/consent.ts:getConsent()`:
  per-category toggles (analytics / marketing / functional). PostHog
  init in `ClientObservability` early-returns when consent denied.
- `/admin/compliance/dpa`: PDF upload to private bucket + signed-URL
  download.
- `/api/admin/compliance/cascade-test`: synthetic-user erasure
  validator — spawns fake user, runs cascade, asserts zero orphans
  across 11 tables.

### Track 9 — AI ops + frontier tech
- Migration `0018_aiops.sql`: pgvector, `content_embeddings`,
  `user_baselines`, `admin_events` (append-only with INSERT/UPDATE/
  DELETE triggers on trips/moments/comments), `admin_replay_log`.
- 5 read-only RPCs (`search_content_semantic`, `admin_user_summary`,
  `admin_recent_trips`, `admin_recent_moments`, `admin_event_history`)
  — all `language sql stable`, callable by the copilot whitelist.
- `lib/admin/embeddings.ts`: `embed()`, `embedMany()`,
  `searchSemantic()`, `indexBatch()`. Deterministic L2-normalized
  SHA-256 stub vector fallback (1536-dim) when `ANTHROPIC_API_KEY` is
  missing — dev/CI keep working.
- `/admin/search`: natural-language search bar with kind chips, scores,
  snippets, deep links.
- `/api/cron/anomaly`: daily recompute of `user_baselines`, surfaces
  >3σ deviations into `moderation_queue`. `vercel.json` schedules.
- `/api/admin/copilot` + `components/AdminCopilot.tsx`: Cmd/Ctrl+.
  side-panel chat, markdown-lite renderer, tool-use loop calling
  `query_supabase` against a 30-name whitelist. System prompt pins
  read-only behavior. Mounted globally in `app/admin/layout.tsx` so
  every admin route gets the copilot.
- **Stretch shipped**: time-travel debugger
  (`/admin/replay/[table]/[id]` with timeline slider + JSON diff),
  live admin presence (`AdminPresence.tsx` via Supabase Realtime),
  telemetry replay script (`npm run replay`), iMessage 2FA stub.
- **Stretch deferred** (TODOs in code): Slack-native admin
  (`/api/slack/admin`), synthetic data generator
  (`/admin/labs/synthetic`), conversational Postgres
  (`/admin/labs/sql-chat`).

## Coordination wins / lessons

- **Sequential foundation phase worked.** Track 1 alone landed first;
  Tracks 2–9 fanned out from a stable base. Tracks 4 and 6 finished
  fastest; Track 9 the largest. Watchdog killed Track 8 once mid-flight
  — re-spawning with explicit "keep tool calls active" guidance worked.
- **Cross-track collisions were minor.** Only 4 conflicts on the final
  merge: `vercel.json` (combined two cron entries), and three list
  pages where Track 9 placed AdminCopilot stubs (resolved by mounting
  AdminCopilot globally in `app/admin/layout.tsx` instead).
- **Migration numbering held.** Slots 0010–0018 assigned upfront, no
  collisions. (The pre-existing 0002/0003 dup flagged in
  `RENUMBER_NOTES.md` is unrelated.)
- **Stable foundation APIs were respected**: every track imports
  `requirePerm` and `audit` from `lib/admin/*` exactly as Track 1
  shipped them. No track redefined its own auth.
- **`lib/pro.ts` left intact** by Track 5 — gate-off rule preserved.
  The new `useProEntitlement()` hook is the server-anchored upgrade
  path when Stripe goes live.

## Env vars to flip on the admin backend

| Var | Track | Effect |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | All | Admin DB access (already needed by social wire). |
| `ADMIN_JWT_SECRET` | 1 | Required. Signs admin cookie + seeds MFA AES key. ≥32 random bytes. |
| `ADMIN_SEED_EMAILS` | 1 | Comma-separated bootstrap super_admin emails. |
| `RESEND_API_KEY` | 1 / 7 / 8 | Magic-link login + DSAR export emails + support reply emails. |
| `RESEND_INBOUND_SECRET` | 7 | HMAC for `/api/support/inbound`. Dev-skip if unset. |
| `ANTHROPIC_API_KEY` | 3 / 7 / 9 | Real Claude classifier + draft replies + copilot + embedding (when endpoint ships). Without it, deterministic stubs. |
| `STRIPE_SECRET_KEY` | 5 | Outbound Stripe REST. |
| `STRIPE_WEBHOOK_SECRET` | 5 | HMAC for `/api/stripe/webhook`. |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` | 5 | Price IDs. |
| `STRIPE_PRICE_MONTHLY_EXPERIMENT` / `STRIPE_PRICE_ANNUAL_EXPERIMENT` | 6 | Optional alt prices for Track 6 pricing experiments. |
| `POSTHOG_PERSONAL_API_KEY` / `POSTHOG_PROJECT_ID` | 4 | PostHog server-side queries. Optional `POSTHOG_HOST`. |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | 4 / 6 | 5–60s flag/metric cache. In-memory fallback otherwise. |
| `CRON_SECRET` | 8 / 9 | Vercel cron auth bearer for retention + anomaly. |
| `IMESSAGE_BRIDGE_URL` + `_TOKEN` | 9 | Future iMessage 2FA bridge. |
| `REPLAY_TARGET` + `REPLAY_ADMIN_COOKIE` | 9 | `npm run replay` against staging. |

## Three suggested next-round tracks

1. **Wire push delivery** — Track E v1 push helper is browser-only;
   Track 7's campaign push fan-out records audit events but doesn't
   actually deliver. Implement server-side VAPID signing (RFC 8291/8292
   via node:crypto) and connect to `outbound_campaigns`.
2. **`<AuthProvider>` impersonation read** — Track 2's impersonation
   cookie + banner are wired, but the user-facing AuthProvider doesn't
   yet read the cookie to swap `user.id`. Without this the impersonator
   sees their own data, not the impersonated user's. Small follow-up,
   high impact for support workflows.
3. **Filter `hidden_at` / `deleted_at` on the public read paths** —
   Track 2 added soft-delete columns; Track 3 added `hidden_at`. The
   user-facing reads (`/explore`, `/u/[username]`, `/tag/[name]`,
   profile pages) need `where hidden_at is null and deleted_at is null`
   added before moderation has actual user-visible effect. Also add
   the abuse-report button (`components/AbuseReportButton.tsx`) to the
   feed UI so users can actually report content.
