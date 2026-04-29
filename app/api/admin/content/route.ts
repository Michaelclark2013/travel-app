// app/api/admin/content/route.ts — Track 2 unified content list API.
//
// WHAT
//   GET /api/admin/content
//     ?kind=moments|trips|comments|dms       — required tab selector
//     &author=<uuid>                         — author filter
//     &from=<iso>&to=<iso>                   — date range
//     &flagged=true                          — only flagged rows (placeholder
//                                              until Track 3 ships flags)
//     &reason=<text>                         — REQUIRED when kind=dms; we
//                                              audit-log every DM page view.
//     &cursor=<created_at|id>
//     &limit=<n>
//
// AUTH
//   `content.read`. For kind=dms we also enforce that `reason` is non-empty
//   and audit-log the page view (DMs are sensitive).
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { auditFireAndForget } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type KindMeta = {
  table: string;
  idCol: string;
  authorCol: string;
  selectCols: string;
  bodyCol?: string;
};

const KINDS: Record<string, KindMeta> = {
  moments: {
    table: "moments",
    idCol: "id",
    authorCol: "user_id",
    selectCols:
      "id, user_id, image_url, caption, location, created_at, deleted_at, hidden_at, featured_at",
  },
  trips: {
    table: "trips",
    idCol: "id",
    authorCol: "user_id",
    selectCols:
      "id, user_id, destination, origin, start_date, end_date, created_at, deleted_at, hidden_at, featured_at",
  },
  comments: {
    table: "comments",
    idCol: "id",
    authorCol: "author_id",
    bodyCol: "body",
    selectCols: "id, author_id, target, body, created_at, deleted_at, hidden_at",
  },
  dms: {
    table: "dm_messages",
    idCol: "id",
    authorCol: "from_user_id",
    bodyCol: "body",
    selectCols: "id, thread_id, from_user_id, body, created_at",
  },
};

export async function GET(req: Request) {
  const session = await requirePerm(req, "content.read");

  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") ?? "moments").toLowerCase();
  const meta = KINDS[kind];
  if (!meta) {
    return Response.json(
      { ok: false, error: `unknown kind: ${kind}` },
      { status: 400 }
    );
  }

  const reason = (url.searchParams.get("reason") ?? "").trim();
  if (kind === "dms") {
    if (!reason) {
      return Response.json(
        {
          ok: false,
          error: "DM viewing requires a non-empty `reason` query param.",
        },
        { status: 400 }
      );
    }
    // Audit-log every DM page view.
    auditFireAndForget(
      "content.dm.view",
      { kind: "dm_page", id: `${session.adminId}:${Date.now()}` },
      { before: null, after: { admin_id: session.adminId, reason } }
    );
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const author = url.searchParams.get("author");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const flagged = url.searchParams.get("flagged");
  const cursor = url.searchParams.get("cursor");

  let q = supa
    .from(meta.table)
    .select(meta.selectCols)
    .order("created_at", { ascending: false })
    .order(meta.idCol, { ascending: false })
    .limit(limit + 1);

  if (author) q = q.eq(meta.authorCol, author);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  if (flagged === "true") {
    // Track 3 ships the flags table; until then "flagged" is a no-op that
    // returns nothing. We model it as "deleted_at is not null" as a
    // best-effort placeholder so the filter wires through.
    q = q.not("deleted_at", "is", null);
  }
  if (cursor) {
    const [ts] = cursor.split("|");
    if (ts) q = q.lt("created_at", ts);
  }

  const { data, error } = await q;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  const rows = data ?? [];
  let nextCursor: string | null = null;
  let trimmed = rows;
  if (rows.length > limit) {
    trimmed = rows.slice(0, limit);
    const last = trimmed[trimmed.length - 1] as unknown as Record<string, unknown>;
    if (last && last["created_at"] && last[meta.idCol]) {
      nextCursor = `${String(last["created_at"])}|${String(last[meta.idCol])}`;
    }
  }
  return Response.json({ ok: true, rows: trimmed, nextCursor, kind });
}
