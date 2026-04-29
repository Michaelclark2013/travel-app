-- ============================================================================
-- 0013_metrics.sql — Track 4: analytics + metrics dashboard.
--
-- WHAT
--   Server-side analytics surface for /admin/metrics. Two pieces:
--     1. analytics_events — tall event table written by the auth'd client.
--                           service_role reads everything; clients can only
--                           insert their own rows.
--     2. metric_cards     — saved custom-metric definitions ("config jsonb")
--                           owned by an admin and rendered via the safe
--                           get_custom_metric() RPC.
--   Plus six RPC functions that the dashboard pages call instead of writing
--   raw SQL from the UI:
--     - get_dau_wau_mau(window_days int)
--     - get_retention_cohort(cohort_start date, cohort_end date)
--     - get_funnel(steps text[])
--     - get_geo_split()
--     - get_device_split()
--     - get_concurrent_sessions(window_minutes int)
--     - get_custom_metric(card_id text)  -- whitelisted base-table builder
--
-- WHY a function per question
--   Querying analytics from a UI = footgun. By forcing the server to call a
--   named, parameterized RPC, we get
--     (a) a tight allow-list of base tables for custom metrics,
--     (b) prepared-statement caching at the PG side,
--     (c) a single grep'able audit surface ("which RPCs touched what?").
--
-- WHY service_role only
--   The admin shell never serves these results to a logged-in end-user; only
--   the server-rendered /admin/metrics page calls them, via getSupabaseAdmin()
--   which uses the service-role key. Locking the RPCs to service_role keeps a
--   misconfigured RLS policy from leaking aggregate analytics to a curious
--   authenticated session.
--
-- ENV VARS
--   SUPABASE_SERVICE_ROLE_KEY — the only key allowed to invoke these RPCs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ANALYTICS_EVENTS — long-form telemetry. The PostHog client wrapper in
-- lib/analytics.ts continues to be the source of truth for *client-side*
-- tracking; this table mirrors the same events into Supabase so server-only
-- queries (cohort, funnel) don't need a PostHog round-trip.
-- ----------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  properties jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

-- Authenticated users can append their own events. Anonymous + service can't.
-- (Service role bypasses RLS so admin reads still work.)
drop policy if exists "analytics_events insert own" on public.analytics_events;
create policy "analytics_events insert own"
  on public.analytics_events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No client-side select. Aggregations always go through the RPCs below
-- (which run as security-definer with service_role grants).
revoke all on public.analytics_events from anon, authenticated;
grant insert on public.analytics_events to authenticated;
grant usage, select on sequence public.analytics_events_id_seq to authenticated;

create index if not exists analytics_events_event_ts_idx
  on public.analytics_events (event, ts desc);
create index if not exists analytics_events_user_ts_idx
  on public.analytics_events (user_id, ts desc);
create index if not exists analytics_events_ts_idx
  on public.analytics_events (ts desc);

-- ----------------------------------------------------------------------------
-- METRIC_CARDS — saved custom-metric definitions for /admin/metrics/builder.
-- The config is intentionally JSON; the get_custom_metric() RPC validates
-- it against the whitelisted base-table list before executing anything.
-- ----------------------------------------------------------------------------
create table if not exists public.metric_cards (
  id text primary key,
  name text not null,
  config jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.metric_cards enable row level security;
revoke all on public.metric_cards from anon, authenticated;
-- service_role bypasses RLS — no policy needed for the admin path.

create index if not exists metric_cards_created_at_idx
  on public.metric_cards (created_at desc);

-- ============================================================================
-- RPC HELPERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_dau_wau_mau(window_days)
--
-- Returns one row per day in the trailing window with the count of unique
-- users active that day, plus the rolling 7d/28d active-user counts. The
-- dashboard renders three sparklines from this.
-- ----------------------------------------------------------------------------
create or replace function public.get_dau_wau_mau(window_days int default 28)
returns table (
  day date,
  dau bigint,
  wau bigint,
  mau bigint
)
language sql
security definer
set search_path = public
as $$
  with days as (
    select generate_series(
      (current_date - (window_days - 1) * interval '1 day')::date,
      current_date,
      interval '1 day'
    )::date as day
  ),
  dau_per_day as (
    select date_trunc('day', ts)::date as day, count(distinct user_id) as dau
      from public.analytics_events
     where ts >= current_date - (window_days - 1) * interval '1 day'
       and user_id is not null
     group by 1
  )
  select
    d.day,
    coalesce(dp.dau, 0)::bigint as dau,
    (
      select count(distinct user_id)
        from public.analytics_events
       where user_id is not null
         and ts >= d.day - interval '6 days'
         and ts <  d.day + interval '1 day'
    )::bigint as wau,
    (
      select count(distinct user_id)
        from public.analytics_events
       where user_id is not null
         and ts >= d.day - interval '27 days'
         and ts <  d.day + interval '1 day'
    )::bigint as mau
  from days d
  left join dau_per_day dp on dp.day = d.day
  order by d.day asc;
$$;

revoke all on function public.get_dau_wau_mau(int) from public, anon, authenticated;
grant execute on function public.get_dau_wau_mau(int) to service_role;

-- ----------------------------------------------------------------------------
-- get_retention_cohort(cohort_start, cohort_end)
--
-- For each weekly cohort in [start, end], compute D1, D7, D30 retention as
-- a fraction of the cohort size. "Cohort" = users whose first analytics_event
-- falls in that week.
-- ----------------------------------------------------------------------------
create or replace function public.get_retention_cohort(
  cohort_start date default (current_date - interval '12 weeks')::date,
  cohort_end date default current_date
)
returns table (
  cohort_week date,
  cohort_size bigint,
  d1 numeric,
  d7 numeric,
  d30 numeric,
  user_ids uuid[]
)
language sql
security definer
set search_path = public
as $$
  with first_seen as (
    select user_id, min(ts)::date as first_day
      from public.analytics_events
     where user_id is not null
     group by user_id
  ),
  cohorts as (
    select
      date_trunc('week', first_day)::date as cohort_week,
      user_id,
      first_day
    from first_seen
    where first_day >= cohort_start
      and first_day <  cohort_end + interval '1 day'
  ),
  ret as (
    select
      c.cohort_week,
      c.user_id,
      c.first_day,
      exists (
        select 1 from public.analytics_events e
         where e.user_id = c.user_id
           and e.ts::date = c.first_day + 1
      ) as r1,
      exists (
        select 1 from public.analytics_events e
         where e.user_id = c.user_id
           and e.ts::date between c.first_day + 6 and c.first_day + 8
      ) as r7,
      exists (
        select 1 from public.analytics_events e
         where e.user_id = c.user_id
           and e.ts::date between c.first_day + 28 and c.first_day + 32
      ) as r30
    from cohorts c
  )
  select
    cohort_week,
    count(*)::bigint as cohort_size,
    case when count(*) = 0 then 0
         else round(100.0 * count(*) filter (where r1)  / count(*), 2) end as d1,
    case when count(*) = 0 then 0
         else round(100.0 * count(*) filter (where r7)  / count(*), 2) end as d7,
    case when count(*) = 0 then 0
         else round(100.0 * count(*) filter (where r30) / count(*), 2) end as d30,
    array_agg(user_id) as user_ids
  from ret
  group by cohort_week
  order by cohort_week desc;
$$;

revoke all on function public.get_retention_cohort(date, date) from public, anon, authenticated;
grant execute on function public.get_retention_cohort(date, date) to service_role;

-- ----------------------------------------------------------------------------
-- get_funnel(steps text[])
--
-- For an ordered list of event names, return the count of users who
-- completed step N >= step N-1 (each user's first occurrence of each step,
-- in time order). Drop-off math is done client-side from this output.
-- ----------------------------------------------------------------------------
create or replace function public.get_funnel(steps text[])
returns table (
  step_index int,
  step_name text,
  user_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  qualified_users uuid[];
  next_qualified uuid[];
begin
  if steps is null or array_length(steps, 1) is null then
    return;
  end if;

  -- Step 0: anyone who fired the first event.
  select array_agg(distinct user_id)
    into qualified_users
    from public.analytics_events
   where event = steps[1] and user_id is not null;

  step_index := 1;
  step_name  := steps[1];
  user_count := coalesce(array_length(qualified_users, 1), 0);
  return next;

  -- Subsequent steps: a user must have fired step i AFTER firing step i-1.
  for i in 2 .. array_length(steps, 1) loop
    select array_agg(distinct e.user_id)
      into next_qualified
      from public.analytics_events e
     where e.event = steps[i]
       and e.user_id = any(qualified_users)
       and e.ts > (
         select min(p.ts)
           from public.analytics_events p
          where p.user_id = e.user_id and p.event = steps[i - 1]
       );
    qualified_users := coalesce(next_qualified, array[]::uuid[]);
    step_index := i;
    step_name  := steps[i];
    user_count := coalesce(array_length(qualified_users, 1), 0);
    return next;
  end loop;
end;
$$;

revoke all on function public.get_funnel(text[]) from public, anon, authenticated;
grant execute on function public.get_funnel(text[]) to service_role;

-- ----------------------------------------------------------------------------
-- get_geo_split() — count of distinct users per country (best-effort: pulls
-- the `country` property out of the events JSON; unknowns bucket as 'unknown').
-- ----------------------------------------------------------------------------
create or replace function public.get_geo_split()
returns table (country text, users bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(nullif(properties->>'country', ''), 'unknown') as country,
    count(distinct user_id)::bigint as users
  from public.analytics_events
  where user_id is not null
    and ts >= now() - interval '30 days'
  group by 1
  order by 2 desc
  limit 50;
$$;

revoke all on function public.get_geo_split() from public, anon, authenticated;
grant execute on function public.get_geo_split() to service_role;

-- ----------------------------------------------------------------------------
-- get_device_split() — same idea, keyed off properties->>'device'.
-- ----------------------------------------------------------------------------
create or replace function public.get_device_split()
returns table (device text, users bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(nullif(properties->>'device', ''), 'unknown') as device,
    count(distinct user_id)::bigint as users
  from public.analytics_events
  where user_id is not null
    and ts >= now() - interval '30 days'
  group by 1
  order by 2 desc;
$$;

revoke all on function public.get_device_split() from public, anon, authenticated;
grant execute on function public.get_device_split() to service_role;

-- ----------------------------------------------------------------------------
-- get_concurrent_sessions(window_minutes) — distinct active users in the
-- trailing window. Realtime panel polls this (Supabase Realtime drives the
-- live re-render; this RPC is the underlying read).
-- ----------------------------------------------------------------------------
create or replace function public.get_concurrent_sessions(window_minutes int default 5)
returns table (active_users bigint)
language sql
security definer
set search_path = public
as $$
  select count(distinct user_id)::bigint as active_users
    from public.analytics_events
   where user_id is not null
     and ts >= now() - (window_minutes || ' minutes')::interval;
$$;

revoke all on function public.get_concurrent_sessions(int) from public, anon, authenticated;
grant execute on function public.get_concurrent_sessions(int) to service_role;

-- ----------------------------------------------------------------------------
-- get_custom_metric(card_id) — read a saved metric_cards row and apply the
-- requested aggregation against a whitelisted base table.
--
-- Whitelist:
--   profiles_public, trips, moments, likes, follows,
--   dm_messages, analytics_events
--
-- Config shape (validated below):
--   {
--     "table":  one of the whitelist,
--     "agg":    "count" | "avg" | "sum",
--     "column": text          (required for avg/sum, ignored for count),
--     "filter": { "key": "<col>", "op": "=" | ">" | "<" | ">=" | "<=", "value": "<text>" }
--                              (optional)
--   }
-- ----------------------------------------------------------------------------
create or replace function public.get_custom_metric(card_id text)
returns table (label text, value numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  card_name text;
  base text;
  agg  text;
  col  text;
  flt  jsonb;
  flt_key text;
  flt_op text;
  flt_val text;
  q text;
  v numeric;
  allowed_tables constant text[] := array[
    'profiles_public','trips','moments','likes','follows','dm_messages','analytics_events'
  ];
  allowed_ops constant text[] := array['=','>','<','>=','<=','<>'];
begin
  select name, config into card_name, cfg
    from public.metric_cards
   where id = card_id;

  if cfg is null then
    raise exception 'metric_card % not found', card_id;
  end if;

  base := cfg->>'table';
  agg  := lower(coalesce(cfg->>'agg','count'));
  col  := cfg->>'column';
  flt  := cfg->'filter';

  if not (base = any(allowed_tables)) then
    raise exception 'table % not in whitelist', base;
  end if;
  if agg not in ('count','avg','sum') then
    raise exception 'agg % not supported', agg;
  end if;

  -- Defensive identifier check on the column reference. Only [a-z0-9_] is
  -- allowed; we still wrap in quote_ident below for belt-and-suspenders.
  if (agg in ('avg','sum')) then
    if col is null or col !~ '^[a-z][a-z0-9_]*$' then
      raise exception 'invalid column %', col;
    end if;
  end if;

  q := 'select ' ||
       case agg
         when 'count' then 'count(*)::numeric'
         when 'avg'   then 'avg(' || quote_ident(col) || ')::numeric'
         when 'sum'   then 'sum(' || quote_ident(col) || ')::numeric'
       end ||
       ' from public.' || quote_ident(base);

  if flt is not null and jsonb_typeof(flt) = 'object' then
    flt_key := flt->>'key';
    flt_op  := coalesce(flt->>'op','=');
    flt_val := flt->>'value';

    if flt_key is null or flt_key !~ '^[a-z][a-z0-9_]*$' then
      raise exception 'invalid filter key %', flt_key;
    end if;
    if not (flt_op = any(allowed_ops)) then
      raise exception 'invalid filter op %', flt_op;
    end if;

    q := q || ' where ' || quote_ident(flt_key) || ' ' || flt_op
          || ' ' || quote_literal(flt_val);
  end if;

  execute q into v;

  label := card_name;
  value := coalesce(v, 0);
  return next;
end;
$$;

revoke all on function public.get_custom_metric(text) from public, anon, authenticated;
grant execute on function public.get_custom_metric(text) to service_role;
