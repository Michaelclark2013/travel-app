-- ============================================================================
-- 0011_admin_users_content.sql — Track 2: user + content management.
--
-- WHAT
--   Adds the columns the admin user / content pages need to soft-delete,
--   hide, and feature rows on the three content tables (profiles_public,
--   moments, trips), plus the `admin_bulk_jobs` table that backs the bulk
--   action engine in lib/admin/bulk.ts.
--
-- WHY a new column rather than a new table
--   The admin UX needs to "soft-delete" a user without losing their content
--   for forensics. Adding `deleted_at` + `hidden_at` + `featured_at` on the
--   row itself keeps the existing reads cheap (no extra join) and lets the
--   public-facing queries simply filter `where deleted_at is null and
--   hidden_at is null`. Public read paths still need to be updated to honor
--   these flags, but that's a follow-up — Track 2 ships only the admin
--   tooling here.
--
-- WHY the bulk-job table
--   Bulk actions (hide 800 moments, delete 200 comments) can take longer
--   than a single request can hold open. We store the job, its target ids,
--   and a progress counter, and let a worker route process in batches of
--   50 with Supabase Realtime broadcasting progress to the admin UI.
--
-- ENV VARS
--   SUPABASE_SERVICE_ROLE_KEY — every read + write here goes through the
--                               service role; RLS is restrictive on
--                               admin_bulk_jobs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles_public — soft delete + hidden + featured.
-- profiles_public has user_id PK; "hidden" and "featured" are useful for
-- the explore page (Track C) to honor.
-- ---------------------------------------------------------------------------
alter table public.profiles_public
  add column if not exists deleted_at timestamptz,
  add column if not exists hidden_at timestamptz,
  add column if not exists featured_at timestamptz;

create index if not exists profiles_public_deleted_idx
  on public.profiles_public (deleted_at)
  where deleted_at is not null;

create index if not exists profiles_public_hidden_idx
  on public.profiles_public (hidden_at)
  where hidden_at is not null;

create index if not exists profiles_public_featured_idx
  on public.profiles_public (featured_at desc)
  where featured_at is not null;

-- ---------------------------------------------------------------------------
-- moments — soft delete + hidden + featured.
-- ---------------------------------------------------------------------------
alter table public.moments
  add column if not exists deleted_at timestamptz,
  add column if not exists hidden_at timestamptz,
  add column if not exists featured_at timestamptz;

create index if not exists moments_deleted_idx
  on public.moments (deleted_at)
  where deleted_at is not null;

create index if not exists moments_hidden_idx
  on public.moments (hidden_at)
  where hidden_at is not null;

create index if not exists moments_featured_idx
  on public.moments (featured_at desc)
  where featured_at is not null;

-- ---------------------------------------------------------------------------
-- trips — soft delete + hidden + featured.
-- (Trips are private by RLS, but admin tooling still wants to mark them
-- hidden/featured for moderation + explore curation.)
-- ---------------------------------------------------------------------------
alter table public.trips
  add column if not exists deleted_at timestamptz,
  add column if not exists hidden_at timestamptz,
  add column if not exists featured_at timestamptz;

create index if not exists trips_deleted_idx
  on public.trips (deleted_at)
  where deleted_at is not null;

create index if not exists trips_hidden_idx
  on public.trips (hidden_at)
  where hidden_at is not null;

create index if not exists trips_featured_idx
  on public.trips (featured_at desc)
  where featured_at is not null;

-- ---------------------------------------------------------------------------
-- comments — soft delete + hidden (no featured needed — feed-only content).
-- The brief lists comments under bulk delete/hide; we add the same columns
-- here so the engine can treat all four content kinds uniformly.
-- ---------------------------------------------------------------------------
alter table public.comments
  add column if not exists deleted_at timestamptz,
  add column if not exists hidden_at timestamptz;

create index if not exists comments_deleted_idx
  on public.comments (deleted_at)
  where deleted_at is not null;

create index if not exists comments_hidden_idx
  on public.comments (hidden_at)
  where hidden_at is not null;

-- ---------------------------------------------------------------------------
-- admin_bulk_jobs — one row per queued/running/done bulk action.
--
-- Status lifecycle:
--   queued  -> running  -> done
--                       -> error
--                       -> cancelled    (set externally by an admin)
--
-- progress is the count of target_ids successfully processed; the worker
-- route at /api/admin/bulk/[jobId]/run resumes from `progress` if the job
-- is re-run after a crash.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_bulk_jobs (
  id text primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_kind text not null,
  target_ids text[] not null,
  dry_run boolean not null default false,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'cancelled', 'done', 'error')),
  progress int not null default 0,
  total int generated always as (coalesce(array_length(target_ids, 1), 0)) stored,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_bulk_jobs enable row level security;
revoke all on public.admin_bulk_jobs from anon, authenticated;

-- The service role bypasses RLS, so admin tooling reads/writes freely. We
-- intentionally do NOT add a select policy for authenticated users — the
-- bulk-jobs table can carry sensitive target lists (suspended users,
-- deleted moments) that should never be exposed client-side.

create index if not exists admin_bulk_jobs_admin_idx
  on public.admin_bulk_jobs (admin_id, created_at desc);
create index if not exists admin_bulk_jobs_status_idx
  on public.admin_bulk_jobs (status, created_at desc);

-- Auto-bump updated_at on every UPDATE so the realtime channel sees the
-- timestamp change (Supabase Realtime broadcasts row diffs by default).
create or replace function public.admin_bulk_jobs_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists admin_bulk_jobs_touch_trigger on public.admin_bulk_jobs;
create trigger admin_bulk_jobs_touch_trigger
  before update on public.admin_bulk_jobs
  for each row execute function public.admin_bulk_jobs_touch();
