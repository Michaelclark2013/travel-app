-- ============================================================================
-- 0010_admin.sql — Track 1: admin auth, RBAC, MFA, audit, invites.
--
-- WHAT
--   Three tables for the admin backend:
--     1. admin_roles      — who is an admin and at what role tier
--     2. admin_audit      — append-only audit trail of every admin mutation
--     3. admin_invites    — short-lived magic-link invites for new admins
--
-- WHY
--   Admins are *not* regular users. They authenticate via a separate magic-link
--   + TOTP flow (see /admin/login + /admin/mfa-setup), get a `voyage_admin`
--   httpOnly JWT cookie that is independent of the user-facing Supabase auth
--   session, and every action they take must leave a row behind in
--   admin_audit. RLS here exists as a defense-in-depth layer; in practice all
--   reads/writes go through the service role client (lib/supabase-server.ts).
--
-- ENV VARS
--   SUPABASE_SERVICE_ROLE_KEY — required for the audit/invite flow to work.
--   ADMIN_JWT_SECRET          — symmetric key for cookie JWT + MFA secret AES.
--   ADMIN_SEED_EMAILS         — comma-separated list of bootstrap super_admins.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ADMIN_ROLES — one row per admin user, with role tier and MFA state.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'admin', 'support', 'finance', 'viewer')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  mfa_enrolled boolean not null default false,
  mfa_secret_encrypted bytea
);

alter table public.admin_roles enable row level security;

-- Only the service role can read or write admin_roles. There is intentionally
-- NO policy that lets a regular authenticated user read this table — the
-- existence of an admin should not be inferable from the client. Tracks 2-9
-- always go through getSupabaseAdmin() which bypasses RLS.
revoke all on public.admin_roles from anon, authenticated;

create index if not exists admin_roles_role_idx on public.admin_roles (role);

-- ---------------------------------------------------------------------------
-- ADMIN_AUDIT — append-only. Every admin mutation lands here.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit (
  id text primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_kind text not null,
  target_id text not null,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  ts timestamptz not null default now()
);

alter table public.admin_audit enable row level security;

-- Defense-in-depth: even though the API only inserts via the service role,
-- explicitly revoke client-side write capability so a misconfigured RLS
-- policy can never let an admin forge an audit row.
revoke all on public.admin_audit from anon, authenticated;

-- Read access is granted via the service role only. Tracks 2-9 should call
-- the typed helper in lib/admin/audit.ts (which uses the service role)
-- rather than querying this table from the browser. Track 1's /admin/audit
-- page uses a server route handler that re-checks the requesting admin's
-- role server-side before returning rows.
--
-- The team lead may add a read-only role grant later if direct SQL access
-- is desired; for now, we keep it locked.

create index if not exists admin_audit_ts_id_idx
  on public.admin_audit (ts desc, id desc);
create index if not exists admin_audit_admin_idx
  on public.admin_audit (admin_id, ts desc);
create index if not exists admin_audit_action_idx
  on public.admin_audit (action, ts desc);
create index if not exists admin_audit_target_idx
  on public.admin_audit (target_kind, target_id, ts desc);

-- Belt-and-suspenders: prevent UPDATE and DELETE on admin_audit even via the
-- service role. PG doesn't have a direct "no-update-ever" option, so we use
-- a row-level trigger that refuses anything other than INSERT/SELECT.
create or replace function public.admin_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit is append-only (op=%)', tg_op;
end;
$$;

drop trigger if exists admin_audit_no_update on public.admin_audit;
create trigger admin_audit_no_update
  before update on public.admin_audit
  for each row execute function public.admin_audit_immutable();

drop trigger if exists admin_audit_no_delete on public.admin_audit;
create trigger admin_audit_no_delete
  before delete on public.admin_audit
  for each row execute function public.admin_audit_immutable();

-- Extra defense: validate before/after are real JSON (the column is jsonb so
-- bad input would be caught at insert time, but explicit beats implicit).
create or replace function public.admin_audit_validate()
returns trigger
language plpgsql
as $$
begin
  if new.before is not null and jsonb_typeof(new.before) is null then
    raise exception 'admin_audit.before must be valid jsonb';
  end if;
  if new.after is not null and jsonb_typeof(new.after) is null then
    raise exception 'admin_audit.after must be valid jsonb';
  end if;
  return new;
end;
$$;

drop trigger if exists admin_audit_validate_jsonb on public.admin_audit;
create trigger admin_audit_validate_jsonb
  before insert on public.admin_audit
  for each row execute function public.admin_audit_validate();

-- ---------------------------------------------------------------------------
-- ADMIN_INVITES — opaque magic-link tokens for inviting new admins.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_invites (
  token text primary key,
  email text not null,
  role text not null check (role in ('super_admin', 'admin', 'support', 'finance', 'viewer')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_invites enable row level security;
revoke all on public.admin_invites from anon, authenticated;

create index if not exists admin_invites_email_idx
  on public.admin_invites (lower(email));
create index if not exists admin_invites_expires_idx
  on public.admin_invites (expires_at)
  where accepted_at is null;
