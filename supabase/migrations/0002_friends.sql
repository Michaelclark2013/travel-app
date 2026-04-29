-- Friend graph + opt-in trip sharing.

create table if not exists public.friendships (
  id text primary key,
  -- "from" user is the one who sent the invite.
  from_user uuid not null references auth.users(id) on delete cascade,
  to_email text not null,
  to_user uuid references auth.users(id) on delete cascade,
  status text not null default 'pending', -- pending | accepted | declined
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists friendships_from_idx on public.friendships (from_user);
create index if not exists friendships_to_email_idx on public.friendships (lower(to_email));

alter table public.friendships enable row level security;

-- The sender always sees the row.
create policy "friends from owner"
  on public.friendships for all
  using (auth.uid() = from_user)
  with check (auth.uid() = from_user);

-- The recipient can read + accept their own pending invites.
create policy "friends to accept"
  on public.friendships for select
  using (auth.uid() = to_user);

create policy "friends to update"
  on public.friendships for update
  using (auth.uid() = to_user)
  with check (auth.uid() = to_user);

-- Tag a saved trip with friends who accompanied / influenced it. This becomes
-- the source of friend-graph recommendations: "Sarah was just in Lisbon."
create table if not exists public.trip_tags (
  trip_id text references public.trips(id) on delete cascade,
  tagged_user uuid references auth.users(id) on delete cascade,
  rating int check (rating between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  primary key (trip_id, tagged_user)
);

alter table public.trip_tags enable row level security;

-- Read: anyone tagged on the trip OR the trip owner can see the tag.
create policy "trip tag read"
  on public.trip_tags for select
  using (
    auth.uid() = tagged_user
    or auth.uid() in (select user_id from public.trips where id = trip_id)
  );
create policy "trip tag write"
  on public.trip_tags for all
  using (
    auth.uid() in (select user_id from public.trips where id = trip_id)
  )
  with check (
    auth.uid() in (select user_id from public.trips where id = trip_id)
  );
