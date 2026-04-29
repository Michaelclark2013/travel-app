# Migration numbering collision — needs team-lead resolution

The Supabase CLI (and most ordering schemes) assumes monotonically increasing
prefixes on `supabase/migrations/*.sql`. We currently have **two pairs of
files at the same number**:

```
0002_friends.sql          (Track ?)  — friendships table
0002_wallet_v2.sql        (Track ?)  — wallet schema bump
0003_social.sql           (Track A)  — profiles_public, follows, moments,
                                       likes, saves, comments, reposts,
                                       notifications, dm_threads, dm_messages,
                                       moments storage bucket
0003_trip_preferences.sql (Track ?)  — trip_preferences column / table
```

## Why I didn't rename them

The Track A brief explicitly says:

> NOTE — supabase/migrations/ has duplicate numbering (0002_friends.sql
> + 0002_wallet_v2.sql; 0003_social.sql + 0003_trip_preferences.sql). Do
> NOT rename. Instead, write supabase/migrations/RENUMBER_NOTES.md flagging
> the collision for the team lead to resolve manually.

Renaming changes which file the CLI thinks has been applied vs which is new,
and risks re-running migrations against a populated database. The right call
is to coordinate the rename with whoever owns the Supabase project's
`supabase_migrations.schema_migrations` table.

## What needs to happen

1. Decide canonical ordering for each pair. Suggested ordering based on
   logical dependency:
   - `0002_friends.sql`  → keep at 0002
   - `0002_wallet_v2.sql` → rename to `0003_wallet_v2.sql`
   - `0003_social.sql`    → rename to `0004_social.sql`
   - `0003_trip_preferences.sql` → rename to `0005_trip_preferences.sql`
   - shift the existing `0004_commitments.sql` and `0005_traveler_profile.sql`
     forward to `0006_*` and `0007_*` respectively.
2. If any of the colliding migrations have **already been applied to a live
   database**, run `supabase db diff --schema public` against an empty target
   to confirm the renamed files reproduce the same final state, then
   manually update the `supabase_migrations.schema_migrations` table to
   reflect the new filenames before the next deploy.
3. Update any seed scripts / docs that reference the old file names.

## Inventory of migrations as of this writing

```
0001_init.sql
0002_friends.sql
0002_wallet_v2.sql        ← DUPLICATE prefix
0003_social.sql
0003_trip_preferences.sql ← DUPLICATE prefix
0004_commitments.sql
0005_traveler_profile.sql
```

Filed by: Track A (Supabase social wiring).
