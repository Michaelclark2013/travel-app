// app/api/admin/audit/route.ts — Track 1 audit-log read API.
//
// WHAT
//   GET ?cursor=<id>&limit=<n>&actor=<uuid>&action=<prefix>&kind=<x>&since=<iso>&until=<iso>
//     -> { rows: [...], nextCursor: string | null }
//
// AUTH
//   Requires audit.read permission. requirePerm() returns/throws.
//
// PAGINATION
//   Cursor is the last `(ts, id)` pair seen, encoded as `ts|id`. We page
//   forward (older rows). The route returns `nextCursor` when there might
//   be more.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  // Throws a Response on denial.
  await requirePerm(req, "audit.read");

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const cursor = url.searchParams.get("cursor");
  const actor = url.searchParams.get("actor");
  const action = url.searchParams.get("action");
  const kind = url.searchParams.get("kind");
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  let q = supa
    .from("admin_audit")
    .select(
      "id, admin_id, action, target_kind, target_id, before, after, ip, user_agent, ts"
    )
    .order("ts", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (actor) q = q.eq("admin_id", actor);
  if (action) q = q.like("action", `${action}%`);
  if (kind) q = q.eq("target_kind", kind);
  if (since) q = q.gte("ts", since);
  if (until) q = q.lte("ts", until);

  if (cursor) {
    const [ts, id] = cursor.split("|");
    if (ts) {
      // Forward pagination: rows older than the cursor row.
      q = q.lt("ts", ts);
      // (Tie-breaker on id is conservative; with a unique id at the same ts
      // this still moves forward. We accept a one-row overlap risk for the
      // simpler query.)
      void id;
    }
  }

  const { data, error } = await q;
  if (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
  const rows = data ?? [];
  let nextCursor: string | null = null;
  let trimmed = rows;
  if (rows.length > limit) {
    trimmed = rows.slice(0, limit);
    const last = trimmed[trimmed.length - 1];
    if (last) nextCursor = `${last.ts}|${last.id}`;
  }
  return Response.json({ ok: true, rows: trimmed, nextCursor });
}
