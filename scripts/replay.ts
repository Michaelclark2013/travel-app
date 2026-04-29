// scripts/replay.ts — Track 9 telemetry replay.
//
// WHAT
//   Reads admin_replay_log rows from production, replays each one against
//   a staging admin endpoint. Each row's `action` is mapped to a route URL
//   and its `payload` becomes the POST body. Designed for blue-green
//   migrations and load testing the admin surface against real action
//   shapes.
//
// USAGE
//   npm run replay -- --since=2026-04-01 [--until=2026-04-15] [--dry] \
//     [--target=https://staging.voyage.app] [--limit=1000]
//
// ENV VARS
//   SUPABASE_URL                 — read source for admin_replay_log
//   SUPABASE_SERVICE_ROLE_KEY    — required to read the replay log
//   REPLAY_TARGET                — staging base URL (defaults to --target)
//   REPLAY_ADMIN_COOKIE          — voyage_admin JWT cookie value to attach
//                                   to each forwarded request
//
// EXIT CODES
//   0 success, 2 misconfig, 3 partial failure (some rows replayed, some
//   errored), 4 fatal.
//
// SHAPE NOTE
//   This is a small ad-hoc script that does not rely on any new npm dep.
//   It uses the @supabase/supabase-js client (already a project dep) and
//   the global `fetch`. Run with: npx tsx scripts/replay.ts -- ...

import { createClient } from "@supabase/supabase-js";

type Args = {
  since: string;
  until?: string;
  target: string;
  limit: number;
  dry: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    opts[k] = v;
  }
  const since = String(opts.since ?? "");
  if (!since) {
    console.error("Usage: npm run replay -- --since=YYYY-MM-DD [...]");
    process.exit(2);
  }
  return {
    since,
    until: opts.until ? String(opts.until) : undefined,
    target: String(opts.target ?? process.env.REPLAY_TARGET ?? ""),
    limit: Number(opts.limit ?? 1000),
    dry: opts.dry === true || opts.dry === "true",
  };
}

// action -> path mapping. Add to this table as new admin mutations are added
// in sister tracks. The script ignores actions that aren't mapped.
const ACTION_MAP: Record<string, string> = {
  "user.suspend": "/api/admin/users/suspend",
  "user.unsuspend": "/api/admin/users/unsuspend",
  "user.delete": "/api/admin/users/delete",
  "moderation.action": "/api/admin/moderation/act",
  "billing.refund": "/api/admin/billing/refund",
  "flag.write": "/api/admin/flags/write",
  "flag.kill": "/api/admin/flags/kill",
  "support.reply": "/api/admin/inbox/reply",
};

async function main() {
  const args = parseArgs();
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(2);
  }
  if (!args.target && !args.dry) {
    console.error("Provide --target=... or REPLAY_TARGET, or pass --dry.");
    process.exit(2);
  }
  const supa = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let q = supa
    .from("admin_replay_log")
    .select("id,admin_id,action,payload,ts")
    .gte("ts", args.since)
    .order("ts", { ascending: true })
    .limit(args.limit);
  if (args.until) q = q.lte("ts", args.until);
  const { data, error } = await q;
  if (error) {
    console.error("[replay] read failed:", error.message);
    process.exit(4);
  }
  const rows = (data ?? []) as Array<{
    id: number;
    admin_id: string;
    action: string;
    payload: unknown;
    ts: string;
  }>;
  console.log(`[replay] ${rows.length} rows since ${args.since}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const path = ACTION_MAP[row.action];
    if (!path) {
      skipped += 1;
      console.log(`  skip  ${row.action} (no mapping)`);
      continue;
    }
    if (args.dry) {
      console.log(`  dry   ${row.action} -> ${path}`);
      ok += 1;
      continue;
    }
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (process.env.REPLAY_ADMIN_COOKIE) {
        headers["cookie"] = `voyage_admin=${process.env.REPLAY_ADMIN_COOKIE}`;
      }
      const res = await fetch(`${args.target}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(row.payload ?? {}),
      });
      if (res.ok) {
        ok += 1;
        console.log(`  ok    ${row.action} -> ${path} [${res.status}]`);
      } else {
        failed += 1;
        console.error(`  FAIL  ${row.action} -> ${path} [${res.status}]`);
      }
    } catch (e) {
      failed += 1;
      console.error(
        `  ERR   ${row.action} -> ${path}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  console.log(
    `[replay] done — ok=${ok} skipped=${skipped} failed=${failed} (of ${rows.length})`
  );
  if (failed > 0 && ok > 0) process.exit(3);
  if (failed > 0 && ok === 0) process.exit(4);
}

main().catch((e) => {
  console.error("[replay] fatal", e);
  process.exit(4);
});
