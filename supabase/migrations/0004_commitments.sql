-- Per-trip fixed commitments (meetings, weddings, conferences, etc.)
-- The day-plan suggestions generated around them are computed client-side
-- so we don't store them server-side.

create table if not exists public.trip_commitments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null references public.trips(id) on delete cascade,
  title text not null,
  address text,
  lat double precision,
  lng double precision,
  date date not null,
  start_time text,
  end_time text,
  all_day boolean not null default false,
  priority text not null default 'must',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists trip_commitments_trip_idx
  on public.trip_commitments (trip_id);

alter table public.trip_commitments enable row level security;

drop policy if exists "trip_commitments owner all" on public.trip_commitments;
create policy "trip_commitments owner all"
  on public.trip_commitments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Track which AI suggestions a user has dismissed so they don't keep coming
-- back when the day is re-planned.
create table if not exists public.trip_dismissed_suggestions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null references public.trips(id) on delete cascade,
  date date not null,
  signature text not null,
  created_at timestamptz not null default now()
);

create index if not exists trip_dismissed_trip_idx
  on public.trip_dismissed_suggestions (trip_id, date);

alter table public.trip_dismissed_suggestions enable row level security;

drop policy if exists "trip_dismissed owner all" on public.trip_dismissed_suggestions;
create policy "trip_dismissed owner all"
  on public.trip_dismissed_suggestions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
