-- ============================================================================
-- 0014_billing.sql — Track 5: server-side Stripe entitlements + webhook
-- idempotency + affiliate revenue tracking.
--
-- WHAT
--   Three tables:
--     1. pro_entitlements      — per-user subscription state (Stripe-derived
--                                or admin-comp). Single source of truth for
--                                "is this user Pro right now?" on the SERVER.
--     2. stripe_events         — every Stripe webhook delivery, by event id.
--                                Used purely for idempotency: if we've seen
--                                the id before, we acknowledge with 200 and
--                                skip reprocessing.
--     3. affiliate_conversions — Travelpayouts (and friends) postback rows.
--                                Drives the /admin/billing/affiliates view
--                                and the monthly payout reconciliation.
--
-- WHY this is its own migration
--   Track 5 is the financial admin sweep. The existing lib/pro.ts is a
--   client-only localStorage gate (kept intentionally — see lib/pro.ts header)
--   and there is no server-side concept of subscription state yet. This
--   migration creates that concept while leaving the client gate untouched.
--
--   Stripe-event idempotency is critical: webhook deliveries can retry
--   forever, and a duplicate `charge.refunded` could double-credit a comp
--   month. By UPSERTing on `stripe_events.id` (= the Stripe event id) at
--   the top of the handler we guarantee at-most-once processing.
--
-- RLS
--   pro_entitlements      — user can SELECT own row; all other ops via the
--                           service role only.
--   stripe_events         — service role only. Never exposed to clients.
--   affiliate_conversions — service role only. Admin UI reads through a
--                           server route handler that re-checks billing.read.
--
-- ENV VARS
--   SUPABASE_SERVICE_ROLE_KEY — used by Track 5 webhook + admin pages.
--   STRIPE_SECRET_KEY         — for outbound Stripe REST calls (refunds,
--                               coupons, retry payment).
--   STRIPE_WEBHOOK_SECRET     — HMAC secret for verifying Stripe-Signature.
--   STRIPE_PRICE_MONTHLY      — Stripe price id (sk_..._monthly_...).
--   STRIPE_PRICE_ANNUAL       — Stripe price id (sk_..._annual_...).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- pro_entitlements — server-side source of truth for Pro status.
-- ---------------------------------------------------------------------------
create table if not exists public.pro_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Where the entitlement came from. Useful for filtering "comps" out of
  -- MRR, and for refusing to refund a manually-granted entitlement.
  source text not null check (source in ('stripe', 'comp', 'manual')),

  -- Stripe linkage. Null when source='comp' or 'manual'.
  stripe_customer_id text,
  stripe_subscription_id text,

  -- Subscription status mirrors Stripe: active, past_due, canceled, etc.
  -- For comps we use 'active' until expires_at; the webhook never touches
  -- comp rows.
  status text not null,

  -- When the current paid period ends (Stripe). For comps, equals expires_at.
  current_period_end timestamptz,

  -- Cancel-at-period-end is a Stripe concept; we mirror it so the admin UI
  -- can show the dunning queue accurately.
  cancel_at_period_end boolean not null default false,

  -- For comps and manual grants: who issued the entitlement and when, plus
  -- a hard expiration. expires_at=null means open-ended (use sparingly).
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,

  updated_at timestamptz not null default now()
);

alter table public.pro_entitlements enable row level security;

-- The user can read their own entitlement. Used by /api/me/pro to drive
-- the new useProEntitlement() hook in lib/pro-entitlement.ts.
-- (PG <16 lacks `CREATE POLICY IF NOT EXISTS`, so we drop-and-recreate.)
drop policy if exists "pro_entitlements_self_read" on public.pro_entitlements;
create policy "pro_entitlements_self_read"
  on public.pro_entitlements
  for select
  using (auth.uid() = user_id);

-- All writes (and admin-side reads) go through the service role client; the
-- explicit revoke is defense-in-depth in case a future policy is too loose.
revoke insert, update, delete on public.pro_entitlements from anon, authenticated;

create index if not exists pro_entitlements_status_idx
  on public.pro_entitlements (status);
create index if not exists pro_entitlements_customer_idx
  on public.pro_entitlements (stripe_customer_id);
create index if not exists pro_entitlements_period_end_idx
  on public.pro_entitlements (current_period_end);

-- Touch updated_at on every row update so the admin UI can show "last
-- changed N min ago" without joining against stripe_events.
create or replace function public.pro_entitlements_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pro_entitlements_touch on public.pro_entitlements;
create trigger pro_entitlements_touch
  before update on public.pro_entitlements
  for each row execute function public.pro_entitlements_touch_updated();

-- ---------------------------------------------------------------------------
-- stripe_events — webhook idempotency log.
--
-- The PK is the Stripe event id (`evt_...`). The webhook UPSERTs into this
-- table at the TOP of the handler; if the row already exists with a non-null
-- processed_at, we return 200 immediately without re-running side effects.
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz
);

alter table public.stripe_events enable row level security;

-- Service role only. Webhook is unauthenticated from the client's POV but
-- runs in a server route handler that uses the service role.
revoke all on public.stripe_events from anon, authenticated;

create index if not exists stripe_events_type_idx
  on public.stripe_events (type);
create index if not exists stripe_events_processed_idx
  on public.stripe_events (processed_at);

-- ---------------------------------------------------------------------------
-- affiliate_conversions — postback rows from Travelpayouts and friends.
--
-- Source: lib/affiliates.ts builds the redirect URLs; this table receives
-- the eventual "did the click convert?" data. Track 5 owns the upsert path
-- and the /admin/billing/affiliates view.
-- ---------------------------------------------------------------------------
create table if not exists public.affiliate_conversions (
  id bigserial primary key,
  marker text,                -- our marker / sub-id sent on the outbound URL
  click_id text,              -- partner's click id (for dedup with their report)
  booking_id text,            -- partner's booking id (post-conversion)
  partner text not null,      -- 'travelpayouts', 'booking', 'getyourguide', etc.
  amount_usd numeric(12, 2),  -- gross commission in USD
  currency text not null default 'USD',
  status text not null default 'pending', -- pending|approved|rejected
  occurred_at timestamptz not null default now(),
  payout_status text not null default 'unpaid', -- unpaid|paid
  payout_at timestamptz,
  unique (partner, click_id)
);

alter table public.affiliate_conversions enable row level security;
revoke all on public.affiliate_conversions from anon, authenticated;

create index if not exists affiliate_conversions_partner_idx
  on public.affiliate_conversions (partner, occurred_at desc);
create index if not exists affiliate_conversions_payout_idx
  on public.affiliate_conversions (payout_status, occurred_at desc);
create index if not exists affiliate_conversions_marker_idx
  on public.affiliate_conversions (marker);
