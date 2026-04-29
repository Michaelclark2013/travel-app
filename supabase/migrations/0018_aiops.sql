-- ============================================================================
-- 0018_aiops.sql — Track 9: AI ops + frontier tech.
--
-- WHAT
--   Five service-role-only tables that back the Track 9 surface:
--     1. content_embeddings  — pgvector embeddings of moments/trips/comments
--                              for semantic search.
--     2. user_baselines      — per-user rolling rates (signups/follows/captures
--                              /api_calls per hour), recomputed by the
--                              anomaly cron. Used to flag >3sigma deviations.
--     3. admin_events        — append-only before/after stream for
--                              time-travel debugging. Triggers on a few
--                              high-value tables write here automatically.
--     4. admin_replay_log    — every admin write that we want to be replayable
--                              against staging (the npm run replay script
--                              reads this).
--
-- WHY
--   Track 9's job is to give the admin team superpowers (semantic search,
--   anomaly surfacing, embedded copilots, time-travel). All four require a
--   data surface the rest of the codebase doesn't already have. Keeping these
--   tables in one migration makes the rollback story trivial and lets the
--   indexer / cron / copilot routes assume a stable shape.
--
-- ENV VARS
--   SUPABASE_SERVICE_ROLE_KEY — only callers with the service role can read or
--                               write any of these tables. RLS is enabled but
--                               the policy set is empty by design.
--   ANTHROPIC_API_KEY         — read by lib/admin/embeddings.ts; falls back
--                               to a deterministic SHA-derived stub when
--                               unset so dev still works.
-- ============================================================================

-- pgvector ships with Supabase; safe to enable here. No npm dep needed.
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- CONTENT_EMBEDDINGS — keyed by (target_kind, target_id). text_hash lets the
-- indexer skip rows whose source text hasn't changed.
-- ---------------------------------------------------------------------------
create table if not exists public.content_embeddings (
  target_kind text not null,
  target_id text not null,
  embedding vector(1536) not null,
  text_hash text not null,
  text_excerpt text,
  model text not null default 'stub-sha256',
  created_at timestamptz not null default now(),
  primary key (target_kind, target_id)
);

alter table public.content_embeddings enable row level security;
revoke all on public.content_embeddings from anon, authenticated;

-- IVFFlat index on cosine distance — Supabase recommends this for vectors up
-- to ~1M rows. The lists count is a heuristic (rows / 1000) but 100 is fine
-- for the launch volume; revisit when we cross 100k embeddings.
create index if not exists content_embeddings_cos_idx
  on public.content_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists content_embeddings_kind_idx
  on public.content_embeddings (target_kind);

-- ---------------------------------------------------------------------------
-- USER_BASELINES — rolling per-user rates. The anomaly cron recomputes these
-- nightly using window functions over the last 30 days of activity.
-- ---------------------------------------------------------------------------
create table if not exists public.user_baselines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signups_per_hour numeric not null default 0,
  follows_per_hour numeric not null default 0,
  captures_per_hour numeric not null default 0,
  api_calls_per_hour numeric not null default 0,
  -- standard deviation columns let us threshold against >3sigma cheaply.
  follows_stddev numeric not null default 0,
  captures_stddev numeric not null default 0,
  api_calls_stddev numeric not null default 0,
  last_recomputed_at timestamptz not null default now()
);

alter table public.user_baselines enable row level security;
revoke all on public.user_baselines from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ADMIN_EVENTS — append-only before/after stream for time-travel debugging.
-- Distinct from admin_audit (which records the *admin's* actions); this
-- stream records *any* mutation to a watched table. Together you can replay
-- a record's full history regardless of who edited it.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_events (
  id bigserial primary key,
  kind text not null, -- 'insert' | 'update' | 'delete'
  target_kind text not null,
  target_id text not null,
  before jsonb,
  after jsonb,
  ts timestamptz not null default now()
);

alter table public.admin_events enable row level security;
revoke all on public.admin_events from anon, authenticated;

create index if not exists admin_events_target_ts_idx
  on public.admin_events (target_kind, target_id, ts desc);
create index if not exists admin_events_ts_idx
  on public.admin_events (ts desc);

-- Trigger function: capture every mutation on a watched table. Tables opt in
-- by attaching a per-row trigger that calls this function. We use TG_TABLE_NAME
-- as target_kind so the same function works across tables.
create or replace function public.admin_events_capture()
returns trigger
language plpgsql
security definer
as $$
declare
  v_id text;
begin
  if (tg_op = 'INSERT') then
    v_id := coalesce((to_jsonb(new) ->> 'id'), '');
    insert into public.admin_events (kind, target_kind, target_id, before, after)
      values ('insert', tg_table_name, v_id, null, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    v_id := coalesce((to_jsonb(new) ->> 'id'), '');
    insert into public.admin_events (kind, target_kind, target_id, before, after)
      values ('update', tg_table_name, v_id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    v_id := coalesce((to_jsonb(old) ->> 'id'), '');
    insert into public.admin_events (kind, target_kind, target_id, before, after)
      values ('delete', tg_table_name, v_id, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

-- Attach to a sensible default set. Tables that don't exist yet (e.g. moments
-- if 0003 hasn't run) are guarded with a do-block.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'trips') then
    drop trigger if exists trips_admin_events on public.trips;
    create trigger trips_admin_events
      after insert or update or delete on public.trips
      for each row execute function public.admin_events_capture();
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'moments') then
    drop trigger if exists moments_admin_events on public.moments;
    create trigger moments_admin_events
      after insert or update or delete on public.moments
      for each row execute function public.admin_events_capture();
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'comments') then
    drop trigger if exists comments_admin_events on public.comments;
    create trigger comments_admin_events
      after insert or update or delete on public.comments
      for each row execute function public.admin_events_capture();
  end if;
end$$;

-- Belt-and-suspenders: admin_events is append-only.
create or replace function public.admin_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'admin_events is append-only (op=%)', tg_op;
end;
$$;

drop trigger if exists admin_events_no_update on public.admin_events;
create trigger admin_events_no_update
  before update on public.admin_events
  for each row execute function public.admin_events_immutable();

drop trigger if exists admin_events_no_delete on public.admin_events;
create trigger admin_events_no_delete
  before delete on public.admin_events
  for each row execute function public.admin_events_immutable();

-- ---------------------------------------------------------------------------
-- ADMIN_REPLAY_LOG — every admin-initiated write that staging can re-apply.
-- The Node script in scripts/replay.ts reads this table, filters by --since,
-- and POSTs each row's payload to the matching staging route.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_replay_log (
  id bigserial primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  payload jsonb not null,
  ts timestamptz not null default now()
);

alter table public.admin_replay_log enable row level security;
revoke all on public.admin_replay_log from anon, authenticated;

create index if not exists admin_replay_log_ts_idx
  on public.admin_replay_log (ts desc);
create index if not exists admin_replay_log_action_idx
  on public.admin_replay_log (action, ts desc);

-- ---------------------------------------------------------------------------
-- search_content_semantic(query_emb, kinds, k)
--
-- Helper RPC the API route calls. Returns the top-k (kind, id, score, excerpt)
-- ordered by cosine distance. Kept as an RPC so the copilot whitelist (which
-- is RPC-only) can also include it.
-- ---------------------------------------------------------------------------
create or replace function public.search_content_semantic(
  query_emb vector(1536),
  kinds text[] default null,
  k int default 20
) returns table (
  target_kind text,
  target_id text,
  text_excerpt text,
  score real
)
language sql
stable
as $$
  select
    ce.target_kind,
    ce.target_id,
    ce.text_excerpt,
    -- 1 - cosine_distance => similarity in [0, 1] for ranking display.
    (1 - (ce.embedding <=> query_emb))::real as score
  from public.content_embeddings ce
  where (kinds is null or ce.target_kind = any(kinds))
  order by ce.embedding <=> query_emb
  limit k;
$$;

-- ---------------------------------------------------------------------------
-- READ-ONLY RPC WHITELIST — the copilot tool can only call functions in this
-- set. We expose a few small helpers; the copilot route imports the same
-- list to keep server + DB in sync. Each function MUST be language sql /
-- stable, take simple scalar params, and select-only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_summary(p_user_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  followers int,
  trip_count bigint,
  moment_count bigint
)
language sql stable as $$
  select
    p.user_id,
    p.username,
    p.display_name,
    p.followers,
    (select count(*) from public.trips t where t.user_id = p.user_id),
    (select count(*) from public.moments m where m.user_id = p.user_id)
  from public.profiles_public p
  where p.user_id = p_user_id;
$$;

create or replace function public.admin_recent_trips(p_user_id uuid, p_limit int default 10)
returns table (id text, destination text, origin text, start_date date, end_date date, created_at timestamptz)
language sql stable as $$
  select id, destination, origin, start_date, end_date, created_at
  from public.trips
  where user_id = p_user_id
  order by created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.admin_recent_moments(p_user_id uuid, p_limit int default 10)
returns table (id text, caption text, location text, like_count int, created_at timestamptz)
language sql stable as $$
  select id, caption, location, like_count, created_at
  from public.moments
  where user_id = p_user_id
  order by created_at desc
  limit greatest(1, least(p_limit, 100));
$$;

create or replace function public.admin_event_history(p_kind text, p_id text, p_limit int default 50)
returns table (kind text, before jsonb, after jsonb, ts timestamptz)
language sql stable as $$
  select kind, before, after, ts
  from public.admin_events
  where target_kind = p_kind and target_id = p_id
  order by ts desc
  limit greatest(1, least(p_limit, 500));
$$;
