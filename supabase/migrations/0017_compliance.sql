-- ============================================================================
-- 0017_compliance.sql — Track 8: GDPR/CCPA, retention, cookies, DPA store.
--
-- WHAT
--   Four tables for the compliance backend:
--     1. dsar_requests      — Data Subject Access Requests (export / erasure)
--     2. cookie_consents    — Per-user cookie preferences (analytics/marketing/
--                             functional). Enables a server-side registry that
--                             complements the client-side localStorage banner.
--     3. retention_policies — Per-table TTLs in days; consumed by the daily
--                             retention cron (app/api/cron/retention).
--     4. dpa_documents      — Signed DPAs/SCCs/legal docs uploaded by admins
--                             to a Storage 'dpa-documents' bucket.
--
-- WHY
--   - DSARs are an auditable workflow with admin approvals. Storing each
--     request lets compliance hand a regulator a paper trail.
--   - Cookie banner alone (localStorage) is not enough for a defensible record:
--     we need a server-recorded log keyed by user_id with timestamp + IP.
--   - Retention is a board-level commitment; codifying it as a DB row that the
--     cron reads makes "we delete X after N days" demonstrable + tunable
--     without redeploys.
--   - DPA documents (vendors, processors) need a single source of truth that
--     legal can hand auditors.
--
-- ENV VARS
--   SUPABASE_SERVICE_ROLE_KEY — required for retention cron + DPA writes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- DSAR_REQUESTS — every export/erasure request, regardless of channel.
-- ---------------------------------------------------------------------------
create table if not exists public.dsar_requests (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('export', 'erasure')),
  status text not null check (status in ('received', 'processing', 'fulfilled', 'rejected')) default 'received',
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  expires_at timestamptz,
  download_url text,
  notes text
);

alter table public.dsar_requests enable row level security;

-- Users can read their own DSAR rows so the /account/privacy page can show
-- "your export is ready". Admin reads/writes go through the service-role
-- client which bypasses RLS.
create policy "dsar_requests read own"
  on public.dsar_requests for select using (auth.uid() = user_id);

-- Inserts are admin-only by default, but we also allow the user to submit
-- their own request from the user-facing /account/privacy form.
create policy "dsar_requests insert own"
  on public.dsar_requests for insert with check (auth.uid() = user_id);

revoke update, delete on public.dsar_requests from anon, authenticated;

create index if not exists dsar_requests_user_idx
  on public.dsar_requests (user_id, requested_at desc);
create index if not exists dsar_requests_status_idx
  on public.dsar_requests (status, requested_at desc);

-- ---------------------------------------------------------------------------
-- COOKIE_CONSENTS — per-user record of their cookie choices.
-- ---------------------------------------------------------------------------
create table if not exists public.cookie_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  analytics boolean not null default false,
  marketing boolean not null default false,
  functional boolean not null default true,
  consented_at timestamptz not null default now(),
  ip text,
  user_agent text
);

alter table public.cookie_consents enable row level security;

create policy "cookie_consents read own"
  on public.cookie_consents for select using (auth.uid() = user_id);

create policy "cookie_consents upsert own"
  on public.cookie_consents for insert with check (auth.uid() = user_id);

create policy "cookie_consents update own"
  on public.cookie_consents for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke delete on public.cookie_consents from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RETENTION_POLICIES — declarative per-table TTLs.
-- ---------------------------------------------------------------------------
create table if not exists public.retention_policies (
  table_name text primary key,
  ttl_days int not null check (ttl_days > 0),
  last_run_at timestamptz,
  last_purged int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.retention_policies enable row level security;

-- Service role only — no client-side reads or writes.
revoke all on public.retention_policies from anon, authenticated;

-- Bootstrap defaults. ON CONFLICT DO NOTHING so re-running the migration is
-- safe and admins can edit the values from the /admin/compliance/retention UI
-- without them being overwritten.
insert into public.retention_policies (table_name, ttl_days) values
  ('dm_messages',      730),
  ('admin_audit',      2555),  -- ~7 years for audit retention.
  ('analytics_events', 365),
  ('abuse_reports',    1825),  -- 5 years.
  ('support_tickets',  730)
on conflict (table_name) do nothing;

-- ---------------------------------------------------------------------------
-- DPA_DOCUMENTS — DPAs, SCCs, privacy notices, ToS versions.
-- ---------------------------------------------------------------------------
create table if not exists public.dpa_documents (
  id text primary key,
  kind text not null check (kind in ('dpa', 'scc', 'privacy', 'tos', 'other')),
  title text not null,
  version text not null,
  signed_at timestamptz,
  signed_by text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.dpa_documents enable row level security;
revoke all on public.dpa_documents from anon, authenticated;

create index if not exists dpa_documents_kind_idx
  on public.dpa_documents (kind, created_at desc);

-- ---------------------------------------------------------------------------
-- STORAGE BUCKETS — exports (private, signed-URL only) + dpa-documents.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('dpa-documents', 'dpa-documents', false)
on conflict (id) do nothing;

-- The exports bucket is read via signed URLs only — NO public select policy.
-- The DPA bucket is admin-only via the service-role client.
