-- ============================================================================
-- 0015_ops.sql — Track 6: ops surface (feature flags + incidents).
--
-- WHAT
--   Three tables for the operations layer:
--     1. feature_flags     — keyed flag definitions; boolean / percentage /
--                            cohort / kill-switch evaluated at request time.
--     2. incidents         — status-page incidents (public or internal).
--     3. incident_updates  — append-only chronological updates per incident.
--
-- WHY
--   - Flags drive rollout, kill-switches, maintenance mode (handled in
--     middleware) and pricing experiments. Service-role only writes; reads
--     happen via lib/admin/flags.ts which goes through the service-role
--     client + a 5s Upstash TTL cache so middleware stays cheap.
--   - Incidents back the public /status page and JSON/RSS feeds. RLS allows
--     authenticated SELECT only when public=true; everything else routes
--     through service role.
--
-- ENV VARS
--   SUPABASE_SERVICE_ROLE_KEY — required for admin writes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FEATURE_FLAGS — one row per flag key.
--
-- value semantics by kind:
--   boolean       → { "on": true|false }
--   percentage    → { "percent": 0..100 }   (rolled out to that % of users)
--   cohort        → { "match": "any"|"all" } (compare ctx vs target)
--   kill_switch   → { "killed": true|false } (when true, gates a feature off
--                                              with the highest priority)
--
-- target jsonb:
--   For cohort flags, an object describing matching rules e.g.
--     { "country": ["US","CA"], "userIds": ["uuid-..."] }
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key text primary key,
  description text,
  kind text not null check (kind in ('boolean', 'percentage', 'cohort', 'kill_switch')),
  value jsonb not null default '{}'::jsonb,
  target jsonb,
  enabled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

-- Service role only. Flags are sensitive (a stray cohort target can leak
-- internal user lists) so we lock down anon + authenticated reads entirely.
revoke all on public.feature_flags from anon, authenticated;

create index if not exists feature_flags_kind_idx on public.feature_flags (kind);
create index if not exists feature_flags_enabled_idx on public.feature_flags (enabled) where enabled = true;

-- ---------------------------------------------------------------------------
-- INCIDENTS — status-page entries.
-- ---------------------------------------------------------------------------
create table if not exists public.incidents (
  id text primary key,
  title text not null,
  severity text not null check (severity in ('minor', 'major', 'critical')),
  status text not null check (status in ('investigating', 'identified', 'monitoring', 'resolved')),
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  public boolean not null default true,
  created_by uuid references auth.users(id) on delete set null
);

alter table public.incidents enable row level security;

-- Public incidents readable by anyone signed-in (and by anon via the public
-- /status page which uses the service role to bypass RLS on read for the
-- anonymous case). Internal incidents only visible to service role.
revoke all on public.incidents from anon, authenticated;

drop policy if exists incidents_public_select on public.incidents;
create policy incidents_public_select on public.incidents
  for select
  to authenticated
  using (public = true);

create index if not exists incidents_started_idx on public.incidents (started_at desc);
create index if not exists incidents_status_idx on public.incidents (status);
create index if not exists incidents_public_idx on public.incidents (public, started_at desc) where public = true;

-- ---------------------------------------------------------------------------
-- INCIDENT_UPDATES — append-only timeline of updates per incident.
-- ---------------------------------------------------------------------------
create table if not exists public.incident_updates (
  id bigserial primary key,
  incident_id text not null references public.incidents(id) on delete cascade,
  body text not null,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz not null default now()
);

alter table public.incident_updates enable row level security;
revoke all on public.incident_updates from anon, authenticated;

-- Same RLS as incidents: authenticated users see updates only when the parent
-- incident is public. Writes always go through service role.
drop policy if exists incident_updates_public_select on public.incident_updates;
create policy incident_updates_public_select on public.incident_updates
  for select
  to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_updates.incident_id
        and i.public = true
    )
  );

create index if not exists incident_updates_incident_idx
  on public.incident_updates (incident_id, posted_at desc);
