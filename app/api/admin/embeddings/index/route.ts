// app/api/admin/embeddings/index/route.ts — Track 9 embedding indexer.
//
// WHAT
//   POST  /api/admin/embeddings/index?kind=<moments|trips|comments>&cursor=<id>&limit=<n>
//     Walks one page of the chosen source table, builds the embedding text,
//     and upserts into content_embeddings via lib/admin/embeddings.ts. The
//     response includes the next cursor so callers can drive the loop from
//     a cron job or a one-off backfill.
//
// AUTH
//   metrics.write — same permission Track 5 uses for cron/backfill jobs.
//
// IDEMPOTENCY
//   indexBatch() compares text_hash before re-embedding, so re-running the
//   indexer over the same window is cheap.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (optional, see embeddings.ts)

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { indexBatch } from "@/lib/admin/embeddings";

const ALLOWED_KINDS = ["moments", "trips", "comments"] as const;
type Kind = (typeof ALLOWED_KINDS)[number];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function POST(req: Request) {
  await requirePerm(req, "metrics.write");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind") as Kind | null;
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const cursor = url.searchParams.get("cursor");

  if (!kindParam || !ALLOWED_KINDS.includes(kindParam)) {
    return Response.json(
      {
        ok: false,
        error: `kind must be one of ${ALLOWED_KINDS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // ---- Pull rows from the source table ---------------------------------
  let rows: Array<{ kind: Kind; id: string; text: string; created_at: string }> = [];

  if (kindParam === "moments") {
    let q = supa
      .from("moments")
      .select("id,caption,location,created_at")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (cursor) q = q.gt("created_at", cursor);
    const { data, error } = await q;
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    rows = (data ?? []).map(
      (r: { id: string; caption: string | null; location: string | null; created_at: string }) => ({
        kind: "moments" as const,
        id: r.id,
        text: [r.caption, r.location].filter(Boolean).join(" — "),
        created_at: r.created_at,
      })
    );
  } else if (kindParam === "trips") {
    let q = supa
      .from("trips")
      .select("id,destination,origin,intent,vibes,created_at")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (cursor) q = q.gt("created_at", cursor);
    const { data, error } = await q;
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    rows = (data ?? []).map(
      (r: {
        id: string;
        destination: string;
        origin: string;
        intent: string | null;
        vibes: string[] | null;
        created_at: string;
      }) => ({
        kind: "trips" as const,
        id: r.id,
        text: [
          `${r.origin} -> ${r.destination}`,
          r.intent ?? "",
          (r.vibes ?? []).join(", "),
        ]
          .filter(Boolean)
          .join(". "),
        created_at: r.created_at,
      })
    );
  } else {
    let q = supa
      .from("comments")
      .select("id,target,body,created_at")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (cursor) q = q.gt("created_at", cursor);
    const { data, error } = await q;
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    rows = (data ?? []).map(
      (r: { id: string; target: string; body: string; created_at: string }) => ({
        kind: "comments" as const,
        id: r.id,
        text: `${r.target}: ${r.body}`,
        created_at: r.created_at,
      })
    );
  }

  if (rows.length === 0) {
    return Response.json({ ok: true, upserted: 0, unchanged: 0, nextCursor: null });
  }

  const result = await indexBatch(
    rows.map((r) => ({ kind: r.kind, id: r.id, text: r.text }))
  );
  const last = rows[rows.length - 1];

  return Response.json({
    ok: true,
    kind: kindParam,
    upserted: result.upserted,
    unchanged: result.unchanged,
    nextCursor: rows.length === limit ? last.created_at : null,
  });
}
