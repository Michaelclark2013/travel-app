-- ============================================================================
-- 0016_support.sql — Track 7: Support inbox + outbound messaging tables.
--
-- WHAT
--   Five tables for the admin support + outbound surface:
--     1. support_tickets    — top-level ticket record, one row per case
--     2. support_messages   — append-only message stream within a ticket
--     3. outbound_campaigns — push / email / banner blasts (draft -> sent)
--     4. campaign_events    — per-recipient delivery + engagement events
--     5. canned_replies     — admin-curated reply macros for the inbox
--
-- WHY
--   - Tickets and messages are split (rather than denormalized) so the
--     inbox can render a thread without round-tripping for every reply,
--     and so the inbound-email webhook can append a message to an existing
--     ticket cheaply.
--   - Campaigns are a thin record (target/body/status) — actual fan-out is
--     driven server-side; campaign_events records what actually happened so
--     the admin UI can show open/click rates.
--   - Macros are tiny and rarely written — a normal table with timestamps.
--
--   All five tables are SERVICE-ROLE-ONLY: the admin surface goes through
--   getSupabaseAdmin() which bypasses RLS. We still enable RLS as
--   defense-in-depth and revoke client grants.
--
-- ENV VARS
--   SUPABASE_SERVICE_ROLE_KEY — for all writes (RLS blocks anon/auth).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SUPPORT_TICKETS — top-level case record.
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  subject text,
  status text not null default 'new'
    check (status in ('new', 'open', 'pending', 'resolved', 'spam')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references auth.users(id) on delete set null,
  sla_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, authenticated;

create index if not exists support_tickets_status_idx
  on public.support_tickets (status, sla_due_at);
create index if not exists support_tickets_priority_idx
  on public.support_tickets (priority, created_at desc);
create index if not exists support_tickets_assigned_idx
  on public.support_tickets (assigned_to, status);
create index if not exists support_tickets_user_idx
  on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_email_idx
  on public.support_tickets (lower(email));
create index if not exists support_tickets_updated_idx
  on public.support_tickets (updated_at desc);

-- Auto-bump updated_at on row change. The inbox sorts by updated_at desc
-- (most-recently-active first) so this trigger keeps that ordering correct.
create or replace function public.support_tickets_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists support_tickets_touch_trg on public.support_tickets;
create trigger support_tickets_touch_trg
  before update on public.support_tickets
  for each row execute function public.support_tickets_touch();

-- ---------------------------------------------------------------------------
-- SUPPORT_MESSAGES — append-only stream of messages on a ticket.
--
-- from_kind:
--   'user'   — customer reply (inbound email or contact form)
--   'admin'  — outgoing reply from a support agent
--   'system' — auto-acknowledgement, auto-close notice, etc.
--   'note'   — internal-only note, never shown to the customer
-- ---------------------------------------------------------------------------
create table if not exists public.support_messages (
  id bigserial primary key,
  ticket_id text not null references public.support_tickets(id) on delete cascade,
  from_kind text not null
    check (from_kind in ('user', 'admin', 'system', 'note')),
  from_id uuid,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon, authenticated;

create index if not exists support_messages_ticket_idx
  on public.support_messages (ticket_id, created_at);
create index if not exists support_messages_from_idx
  on public.support_messages (from_id, created_at desc);

-- Bump the parent ticket's updated_at on every new message so the inbox
-- reorders correctly.
create or replace function public.support_messages_bump_ticket()
returns trigger
language plpgsql
as $$
begin
  update public.support_tickets
    set updated_at = now()
    where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists support_messages_bump_ticket_trg on public.support_messages;
create trigger support_messages_bump_ticket_trg
  after insert on public.support_messages
  for each row execute function public.support_messages_bump_ticket();

-- ---------------------------------------------------------------------------
-- OUTBOUND_CAMPAIGNS — push / email / banner blasts.
--
-- target jsonb: free-form audience selector. Examples:
--   { "kind": "all" }
--   { "kind": "has_pro", "value": true }
--   { "kind": "signed_up_within_days", "value": 30 }
--   { "kind": "country", "value": "US" }
--   { "kind": "inactive_within_days", "value": 14 }
--
-- body jsonb: kind-specific payload. push -> { title, body, deeplink };
-- email -> { subject, markdown, html }; banner -> { id, html, severity }.
-- ---------------------------------------------------------------------------
create table if not exists public.outbound_campaigns (
  id text primary key,
  kind text not null check (kind in ('push', 'email', 'banner')),
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  target jsonb not null default '{"kind":"all"}'::jsonb,
  body jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outbound_campaigns enable row level security;
revoke all on public.outbound_campaigns from anon, authenticated;

create index if not exists outbound_campaigns_kind_idx
  on public.outbound_campaigns (kind, created_at desc);
create index if not exists outbound_campaigns_status_idx
  on public.outbound_campaigns (status, scheduled_at);
create index if not exists outbound_campaigns_created_idx
  on public.outbound_campaigns (created_at desc);

create or replace function public.outbound_campaigns_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists outbound_campaigns_touch_trg on public.outbound_campaigns;
create trigger outbound_campaigns_touch_trg
  before update on public.outbound_campaigns
  for each row execute function public.outbound_campaigns_touch();

-- ---------------------------------------------------------------------------
-- CAMPAIGN_EVENTS — per-recipient delivery + engagement events.
-- Composite PK prevents double-counting the same event for the same
-- recipient (e.g. duplicate Resend webhook deliveries).
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_events (
  campaign_id text not null references public.outbound_campaigns(id) on delete cascade,
  user_id uuid not null,
  event text not null
    check (event in ('queued', 'sent', 'opened', 'clicked', 'bounced')),
  ts timestamptz not null default now(),
  primary key (campaign_id, user_id, event)
);

alter table public.campaign_events enable row level security;
revoke all on public.campaign_events from anon, authenticated;

create index if not exists campaign_events_campaign_event_idx
  on public.campaign_events (campaign_id, event);
create index if not exists campaign_events_user_idx
  on public.campaign_events (user_id, ts desc);

-- ---------------------------------------------------------------------------
-- CANNED_REPLIES — reusable reply templates ("macros") for the inbox.
-- ---------------------------------------------------------------------------
create table if not exists public.canned_replies (
  id text primary key,
  name text not null,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.canned_replies enable row level security;
revoke all on public.canned_replies from anon, authenticated;

create index if not exists canned_replies_name_idx
  on public.canned_replies (lower(name));
create index if not exists canned_replies_created_idx
  on public.canned_replies (created_at desc);
