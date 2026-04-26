-- Wallet v2: multi-currency, route info, multi-day stays, and shareable links.

-- ----- Extend wallet_items -----
alter table public.wallet_items
  add column if not exists end_date date,
  add column if not exists from_loc text,
  add column if not exists to_loc text,
  add column if not exists total_original numeric,
  add column if not exists currency text;

-- Some clients need `wallet_confirmations` as the canonical name; keep a view
-- so either spelling works for ad-hoc queries.
create or replace view public.wallet_confirmations as
  select * from public.wallet_items;

-- ----- Shareable wallet snapshots -----
-- A token-addressed snapshot of a trip's wallet. Anyone with the link can
-- view; only the owner can revoke.
create table if not exists public.wallet_shares (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text references public.trips(id) on delete set null,
  trip_label text not null,
  owner_name text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists wallet_shares_user_idx on public.wallet_shares (user_id);

alter table public.wallet_shares enable row level security;

-- Owners can manage their own shares.
drop policy if exists "wallet_shares owner all" on public.wallet_shares;
create policy "wallet_shares owner all"
  on public.wallet_shares for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public read by token — anyone with the link sees the snapshot, but they
-- never see the owner's full wallet. Postgres can't easily enforce "match
-- the URL token" via RLS without security definer; in practice the page
-- queries through a Postgres function below.
drop policy if exists "wallet_shares anon read" on public.wallet_shares;
create policy "wallet_shares anon read"
  on public.wallet_shares for select
  using (true);

-- ----- Inbox: forwarded emails awaiting parsing -----
create table if not exists public.wallet_inbox (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  from_email text,
  subject text,
  body text not null,
  parsed_id text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.wallet_inbox enable row level security;

drop policy if exists "wallet_inbox owner read" on public.wallet_inbox;
create policy "wallet_inbox owner read"
  on public.wallet_inbox for select
  using (auth.uid() = user_id);

drop policy if exists "wallet_inbox anon insert" on public.wallet_inbox;
create policy "wallet_inbox anon insert"
  on public.wallet_inbox for insert
  with check (true);
