// app/api/moderation/queue/route.ts — Track 3 moderation queue list API.
//
// WHAT
//   GET ?status=<pending|approved|rejected|escalated>&limit=<n>&cursor=<id>
//     -> { rows: QueueRow[], nextCursor }
//
//   QueueRow includes the target's preview content (caption / body / image)
//   so the admin UI doesn't need to round-trip per row.
//
// AUTH
//   Requires moderation.review.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const ALLOWED_STATUS = new Set(["pending", "approved", "rejected", "escalated"]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  await requirePerm(req, "moderation.review");

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";
  if (!ALLOWED_STATUS.has(status)) {
    return Response.json({ ok: false, error: "bad status" }, { status: 400 });
  }
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const cursor = url.searchParams.get("cursor");

  let q = supa
    .from("moderation_queue")
    .select(
      "id, target_kind, target_id, scores, status, auto_action, admin_decision, decided_by, decided_at, created_at"
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    const [ts] = cursor.split("|");
    if (ts) q = q.lt("created_at", ts);
  }

  const { data, error } = await q;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  const all = data ?? [];
  const trimmed = all.slice(0, limit);
  const nextCursor =
    all.length > limit && trimmed.length > 0
      ? `${trimmed[trimmed.length - 1].created_at}|${trimmed[trimmed.length - 1].id}`
      : null;

  // Bulk-load preview content for each row. We fetch all moments / comments /
  // dms in three calls instead of N round-trips.
  const byKind: Record<string, string[]> = { moment: [], comment: [], dm: [] };
  for (const r of trimmed) {
    if (r.target_kind in byKind) byKind[r.target_kind].push(r.target_id);
  }

  const previews: Record<string, { kind: string; preview: string; image?: string; author?: string }> = {};
  if (byKind.moment.length > 0) {
    const { data: moms } = await supa
      .from("moments")
      .select("id, caption, image_url, user_id, hidden_at")
      .in("id", byKind.moment);
    for (const m of moms ?? []) {
      previews[`moment:${m.id}`] = {
        kind: "moment",
        preview: m.caption ?? "(no caption)",
        image: m.image_url ?? undefined,
        author: m.user_id ?? undefined,
      };
    }
  }
  if (byKind.comment.length > 0) {
    const { data: cs } = await supa
      .from("comments")
      .select("id, body, author_id")
      .in("id", byKind.comment);
    for (const c of cs ?? []) {
      previews[`comment:${c.id}`] = {
        kind: "comment",
        preview: c.body ?? "",
        author: c.author_id ?? undefined,
      };
    }
  }
  if (byKind.dm.length > 0) {
    const { data: dms } = await supa
      .from("dm_messages")
      .select("id, body, from_user_id")
      .in("id", byKind.dm);
    for (const d of dms ?? []) {
      previews[`dm:${d.id}`] = {
        kind: "dm",
        preview: d.body ?? "",
        author: d.from_user_id ?? undefined,
      };
    }
  }

  const rows = trimmed.map((r) => ({
    ...r,
    preview: previews[`${r.target_kind}:${r.target_id}`] ?? null,
  }));

  return Response.json({ ok: true, rows, nextCursor });
}
