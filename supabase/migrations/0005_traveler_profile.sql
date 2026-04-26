-- Global traveler profile + per-trip workouts.

alter table public.profiles
  add column if not exists traveler_profile jsonb not null default '{}'::jsonb;

create table if not exists public.trip_workouts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null references public.trips(id) on delete cascade,
  date date not null,
  start_time text,
  end_time text,
  type text not null,
  venue text,
  address text,
  notes text,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

create index if not exists trip_workouts_trip_idx on public.trip_workouts (trip_id);

alter table public.trip_workouts enable row level security;

drop policy if exists "trip_workouts owner all" on public.trip_workouts;
create policy "trip_workouts owner all"
  on public.trip_workouts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
