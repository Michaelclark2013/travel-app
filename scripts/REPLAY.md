# Replay script

Re-applies admin actions captured in `admin_replay_log` against a staging
environment. Useful for blue-green migrations and load-testing the admin
surface against production-shaped traffic.

## Usage

```bash
# Required: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars to read the log.
# Required for non-dry runs: REPLAY_TARGET (or --target), REPLAY_ADMIN_COOKIE.

npm run replay -- --since=2026-04-01 --dry            # preview, no requests
npm run replay -- --since=2026-04-01 --target=https://staging.voyage.app
npm run replay -- --since=2026-04-01 --until=2026-04-15 --limit=500
```

## Flags

| Flag        | Default               | Notes                                            |
| ----------- | --------------------- | ------------------------------------------------ |
| `--since`   | (required)            | ISO date or timestamp                            |
| `--until`   | now                   | upper bound (inclusive)                          |
| `--target`  | `$REPLAY_TARGET`      | base URL of the staging admin                    |
| `--limit`   | `1000`                | max rows to replay in one run                    |
| `--dry`     | off                   | log mappings but skip the HTTP calls             |

## Action mapping

`scripts/replay.ts` maintains an `ACTION_MAP` table from `admin_replay_log.action`
to a staging route path. Add a row whenever a sister track introduces a new
mutating action. Unknown actions are logged and skipped, never blindly forwarded.

## Exit codes

* `0` — all rows replayed (or dry-run)
* `2` — bad arguments / missing env
* `3` — partial failure (some rows ok, some failed)
* `4` — fatal (read failure, all rows failed)

## Safety

* Reads use the service-role key. **Never** copy this key to a developer
  laptop except for ad-hoc replays. Prefer running the script from a Vercel
  cron or a controlled CI host.
* The script does not write back to production. The only side-effect is the
  POSTs to `--target`.
* Add a feature flag check on the staging side before swapping over real
  traffic.
