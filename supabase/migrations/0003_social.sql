-- Social layer: public profiles, follow graph, moments, likes, saves,
-- comments, reposts, and Storage bucket for moment images. Mirrors the
-- shapes used by lib/social.ts + lib/memory-roll.ts + lib/comments-reposts.ts
-- so swapping local storage for Supabase is a per-helper change.

-- ============================================================================
-- PROFILES_PUBLIC — what /u/[username] shows the world
-- ============================================================================
create table if not exists public.profiles_public (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{2,30}$'),
  display_name text,
  bio text,
  avatar_hue smallint default 200,
  travel_styles text[] default '{}',
  instagram text,
  tiktok text,
  website text,
  followers int default 0, -- materialized from follows; refreshed by trigger
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles_public enable row level security;

-- Anyone can read public profiles (the whole point).
create policy "profiles_public read"
  on public.profiles_public for select using (true);

-- Only the owner can edit their own row.
create policy "profiles_public write own"
  on public.profiles_public for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists profiles_public_username_idx
  on public.profiles_public (lower(username));

-- ============================================================================
-- FOLLOWS — directed follow graph
-- ============================================================================
create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table public.follows enable row level security;

create policy "follows read all" on public.follows for select using (true);
create policy "follows insert own" on public.follows for insert
  with check (auth.uid() = follower_id);
create policy "follows delete own" on public.follows for delete
  using (auth.uid() = follower_id);

create index if not exists follows_followee_idx on public.follows (followee_id);

-- Refresh the materialized follower count whenever follows change.
create or replace function public.refresh_followers() returns trigger as $$
begin
  update public.profiles_public
     set followers = (
       select count(*) from public.follows where followee_id = coalesce(new.followee_id, old.followee_id)
     )
   where user_id = coalesce(new.followee_id, old.followee_id);
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists follows_refresh_count on public.follows;
create trigger follows_refresh_count
  after insert or delete on public.follows
  for each row execute function public.refresh_followers();

-- ============================================================================
-- MOMENTS — kept Memory Roll photos, public on user's profile
-- ============================================================================
create table if not exists public.moments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  caption text,
  location text,
  /* Optional reference to which trip this came from. */
  trip_id text references public.trips(id) on delete set null,
  /* Counts kept hot via triggers below. */
  like_count int default 0,
  save_count int default 0,
  repost_count int default 0,
  comment_count int default 0,
  created_at timestamptz default now()
);

alter table public.moments enable row level security;

create policy "moments read all" on public.moments for select using (true);
create policy "moments write own" on public.moments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists moments_user_created_idx
  on public.moments (user_id, created_at desc);
create index if not exists moments_recent_idx
  on public.moments (created_at desc);

-- ============================================================================
-- LIKES + SAVES — generic engagement on a target moment
-- ============================================================================
create table if not exists public.likes (
  user_id uuid references auth.users(id) on delete cascade,
  moment_id text references public.moments(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, moment_id)
);
alter table public.likes enable row level security;
create policy "likes read all" on public.likes for select using (true);
create policy "likes insert own" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes delete own" on public.likes for delete using (auth.uid() = user_id);

create table if not exists public.saves (
  user_id uuid references auth.users(id) on delete cascade,
  moment_id text references public.moments(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, moment_id)
);
alter table public.saves enable row level security;
create policy "saves read own" on public.saves for select using (auth.uid() = user_id);
create policy "saves write own" on public.saves for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- COMMENTS — threadable replies
-- ============================================================================
create table if not exists public.comments (
  id text primary key,
  /* Polymorphic-style target — same convention as lib/comments-reposts.ts. */
  target text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

alter table public.comments enable row level security;

create policy "comments read all" on public.comments for select using (true);
create policy "comments insert own" on public.comments for insert
  with check (auth.uid() = author_id);
create policy "comments delete own" on public.comments for delete
  using (auth.uid() = author_id);

create index if not exists comments_target_idx on public.comments (target, created_at);

-- ============================================================================
-- REPOSTS
-- ============================================================================
create table if not exists public.reposts (
  user_id uuid references auth.users(id) on delete cascade,
  target text not null,
  caption text,
  created_at timestamptz default now(),
  primary key (user_id, target)
);
alter table public.reposts enable row level security;
create policy "reposts read all" on public.reposts for select using (true);
create policy "reposts write own" on public.reposts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- NOTIFICATIONS — server-emitted by triggers (likes, follows, comments)
-- ============================================================================
create table if not exists public.notifications (
  id text primary key,
  /* The user the notification is FOR. */
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  from_user_id uuid references auth.users(id) on delete set null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;
create policy "notifs read own" on public.notifications for select using (auth.uid() = user_id);
create policy "notifs update own" on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists notifs_user_read_idx
  on public.notifications (user_id, read_at, created_at desc);

-- ============================================================================
-- DM THREADS + MESSAGES
-- ============================================================================
create table if not exists public.dm_threads (
  id text primary key,
  /* Two-party chat — extend later with `participants uuid[]` for groups. */
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_a, user_b)
);
alter table public.dm_threads enable row level security;
create policy "threads read participants" on public.dm_threads for select
  using (auth.uid() in (user_a, user_b));
create policy "threads write participants" on public.dm_threads for insert
  with check (auth.uid() in (user_a, user_b));

create table if not exists public.dm_messages (
  id text primary key,
  thread_id text not null references public.dm_threads(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
alter table public.dm_messages enable row level security;
create policy "msgs read participants" on public.dm_messages for select
  using (
    auth.uid() in (
      select user_a from public.dm_threads where id = thread_id
      union all
      select user_b from public.dm_threads where id = thread_id
    )
  );
create policy "msgs write own" on public.dm_messages for insert
  with check (
    auth.uid() = from_user_id
    and auth.uid() in (
      select user_a from public.dm_threads where id = thread_id
      union all
      select user_b from public.dm_threads where id = thread_id
    )
  );

-- ============================================================================
-- STORAGE BUCKET — moment images
-- ============================================================================
-- Run once: creates a public bucket called `moments`.
insert into storage.buckets (id, name, public)
values ('moments', 'moments', true)
on conflict (id) do nothing;

-- Owner-only writes — RLS-equivalent for storage objects.
create policy if not exists "moments-storage-read"
  on storage.objects for select
  using (bucket_id = 'moments');

create policy if not exists "moments-storage-write-own"
  on storage.objects for insert
  with check (
    bucket_id = 'moments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy if not exists "moments-storage-delete-own"
  on storage.objects for delete
  using (
    bucket_id = 'moments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
