-- Voyage initial schema. Run this once in your Supabase SQL editor.

-- Trips table — one row per saved trip, owned by an authed user.
create table if not exists public.trips (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  origin text not null,
  start_date date not null,
  end_date date not null,
  travelers int not null default 1,
  budget int,
  vibes text[] not null default '{}',
  intent text,
  with_kids boolean default false,
  accessibility boolean default false,
  carbon_aware boolean default false,
  itinerary jsonb not null,
  selected_flight_id text,
  selected_hotel_id text,
  transport_mode text not null default 'transit',
  invitees jsonb default '[]'::jsonb,
  expenses jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_user_id_idx on public.trips (user_id);

-- Profile / preferences — one row per user.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  prefer_aisle boolean default false,
  avoid_redeyes boolean default false,
  walk_pace text default 'normal',
  diet text default '',
  loyalty_card_ids text[] default '{}',
  updated_at timestamptz not null default now()
);

-- Wallet (parsed confirmations) — flat list scoped to user.
create table if not exists public.wallet_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text references public.trips(id) on delete set null,
  type text not null,
  title text not null,
  vendor text not null,
  reference text not null,
  date date not null,
  time text,
  detail text,
  total_usd numeric,
  source text not null default 'auto-import',
  created_at timestamptz not null default now()
);

create index if not exists wallet_user_idx on public.wallet_items (user_id);

-- RLS — every user sees only their own rows.
alter table public.trips enable row level security;
alter table public.profiles enable row level security;
alter table public.wallet_items enable row level security;

create policy "trips owner select"
  on public.trips for select using (auth.uid() = user_id);
create policy "trips owner insert"
  on public.trips for insert with check (auth.uid() = user_id);
create policy "trips owner update"
  on public.trips for update using (auth.uid() = user_id);
create policy "trips owner delete"
  on public.trips for delete using (auth.uid() = user_id);

create policy "profiles owner all"
  on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "wallet owner all"
  on public.wallet_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
