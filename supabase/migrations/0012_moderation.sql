-- ============================================================================
-- 0012_moderation.sql — Track 3: Moderation + Trust & Safety.
--
-- WHAT
--   Three tables that back the Claude-powered moderation pipeline:
--     1. moderation_queue   — every classification result, plus the admin's
--                              decision when the row is reviewed.
--     2. abuse_reports      — user-submitted reports against another user's
--                              moment / comment / DM. Anyone authenticated
--                              can INSERT; only admins SELECT/UPDATE.
--     3. pattern_bans       — deterministic deny-list (content hash, IP,
--                              fingerprint, regex, perceptual hash) that
--                              short-circuits the Claude call.
--
--   Plus: adds `hidden_at` columns to moments / comments / dm_messages so the
--   auto-rejected pipeline has a soft-delete column to flip without losing
--   the row (we keep the data for forensic / appeal flow). The hidden_at
--   filter is NOT enforced via RLS in this migration — feed renderers should
--   add a `where hidden_at is null` clause. Enforcing in RLS would silently
--   break the moderation queue's own thumbnails.
--
-- WHY
--   See lib/admin/moderation.ts for the classifier wrapper, lib/admin/patterns.ts
--   for the deterministic deny-list eval, and app/api/moderation/classify
--   for the trigger pipeline. This SQL is just storage — RLS keeps the
--   admin-only rows out of the user-side client.
--
-- ENV VARS (consumed by callers, not this file)
--   SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- MODERATION_QUEUE — the canonical store of every classification.
--
-- One row per (target_kind, target_id) classification event. We DON'T enforce
-- a unique constraint on (target_kind, target_id) — re-classifying the same
-- piece of content (after an edit, or as part of a sweep) writes a new row
-- so the audit trail records every pass.
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_queue (
  id text primary key,
  target_kind text not null,                  -- 'moment' | 'comment' | 'dm' | …
  target_id text not null,
  scores jsonb not null default '{}'::jsonb,  -- { spam: 0.12, harassment: 0.04, … }
  status text not null check (status in ('pending', 'approved', 'rejected', 'escalated')),
  auto_action text,                            -- 'auto-approved' | 'auto-rejected' | null
  admin_decision text,                         -- 'approve' | 'reject' | 'escalate' | null
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.moderation_queue enable row level security;
revoke all on public.moderation_queue from anon, authenticated;

-- Primary read pattern is "show me the queue, newest first, filtered by status".
create index if not exists moderation_queue_status_created_idx
  on public.moderation_queue (status, created_at desc);
create index if not exists moderation_queue_target_idx
  on public.moderation_queue (target_kind, target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- ABUSE_REPORTS — user-initiated reports.
--
-- Anyone authenticated can INSERT a report (with their own reporter_id);
-- nobody but the service role can SELECT or UPDATE. Resolution flow lives
-- in /admin/moderation: an admin links the report to a moderation_queue row
-- and resolves both together.
-- ---------------------------------------------------------------------------
create table if not exists public.abuse_reports (
  id text primary key,
  reporter_id uuid references auth.users(id) on delete set null,
  target_kind text not null,
  target_id text not null,
  reason text not null,                        -- short tag: 'spam' | 'harass' | …
  context jsonb,                                -- free-form: { note, screenshots, … }
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text                               -- 'upheld' | 'dismissed' | 'escalated'
);

alter table public.abuse_reports enable row level security;

-- Authenticated users can file a report against any target. We don't allow
-- them to read back even their own (privacy: a malicious reporter shouldn't
-- be able to enumerate report history). The /api/moderation/report endpoint
-- echoes the inserted id; that's the only signal a reporter gets.
revoke all on public.abuse_reports from anon, authenticated;

create policy "abuse_reports insert authenticated"
  on public.abuse_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

-- No SELECT / UPDATE / DELETE policies for non-service-role. The service
-- role bypasses RLS and is used by /api/moderation/* and /admin/moderation.

create index if not exists abuse_reports_target_idx
  on public.abuse_reports (target_kind, target_id, created_at desc);
create index if not exists abuse_reports_open_idx
  on public.abuse_reports (created_at desc)
  where resolved_at is null;

-- ---------------------------------------------------------------------------
-- PATTERN_BANS — deterministic deny-list evaluated BEFORE Claude.
--
-- Cheap O(1)-ish checks that catch known bad content / actors so we don't
-- burn an LLM call on it. Service role only — admin tools insert/expire here.
-- ---------------------------------------------------------------------------
create table if not exists public.pattern_bans (
  id text primary key,
  kind text not null check (
    kind in ('content_hash', 'ip', 'ip_range', 'fingerprint', 'keyword_regex', 'phash')
  ),
  value text not null,                          -- canonical lowercase form
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz                        -- null = permanent
);

alter table public.pattern_bans enable row level security;
revoke all on public.pattern_bans from anon, authenticated;

create index if not exists pattern_bans_kind_value_idx
  on public.pattern_bans (kind, value);
create index if not exists pattern_bans_active_idx
  on public.pattern_bans (kind)
  where expires_at is null or expires_at > now();

-- ---------------------------------------------------------------------------
-- HIDDEN_AT columns on user-content tables.
--
-- The auto-rejected pipeline flips hidden_at to "now()" so the row stops
-- rendering in feeds without being deleted. Feed queries must filter on
-- `hidden_at is null`. We keep the data so the user can appeal and we can
-- re-train the classifier.
-- ---------------------------------------------------------------------------
alter table public.moments      add column if not exists hidden_at timestamptz;
alter table public.comments     add column if not exists hidden_at timestamptz;
alter table public.dm_messages  add column if not exists hidden_at timestamptz;

create index if not exists moments_hidden_idx
  on public.moments (hidden_at) where hidden_at is not null;
create index if not exists comments_hidden_idx
  on public.comments (hidden_at) where hidden_at is not null;
create index if not exists dm_messages_hidden_idx
  on public.dm_messages (hidden_at) where hidden_at is not null;

-- ---------------------------------------------------------------------------
-- Supabase trigger pipeline — DOCUMENTED, NOT ENABLED.
--
-- enable after function URL is set in secrets
--
-- The intended pipeline:
--
--   create or replace function public.moderation_enqueue()
--   returns trigger
--   language plpgsql
--   security definer
--   as $$
--   declare
--     payload jsonb;
--   begin
--     payload := jsonb_build_object(
--       'kind', tg_argv[0],
--       'id',   new.id
--     );
--     -- Fire-and-forget HTTP call to the classify endpoint. Requires the
--     -- `pg_net` extension and a vault entry with the function URL.
--     perform net.http_post(
--       url     := vault.read_secret('moderation_classify_url'),
--       headers := jsonb_build_object('content-type', 'application/json'),
--       body    := payload
--     );
--     return new;
--   end;
--   $$;
--
--   create trigger moderation_on_moment_insert
--     after insert on public.moments
--     for each row execute function public.moderation_enqueue('moment');
--
--   create trigger moderation_on_comment_insert
--     after insert on public.comments
--     for each row execute function public.moderation_enqueue('comment');
--
--   create trigger moderation_on_dm_insert
--     after insert on public.dm_messages
--     for each row execute function public.moderation_enqueue('dm');
--
-- Why disabled: until pg_net is enabled and the URL secret is populated
-- the trigger would either no-op or throw. We prefer to call the classify
-- endpoint explicitly from the write paths (lib/social.ts, lib/comments-reposts.ts,
-- lib/dm.ts) until ops flips this on.
-- ---------------------------------------------------------------------------
