// app/api/moderation/pattern-ban/route.ts — Track 3 pattern_bans CRUD.
//
// WHAT
//   POST { kind, value, reason?, expiresAt?, fromQueueId? } -> { ok, id }
//   GET  ?kind=<...>                                        -> { rows }
//
//   POST is the "Apply pattern ban" button on the queue UI. When fromQueueId
//   is set we also auto-reject any matching pending row with the same
//   target_id so the deny-list takeover is visible immediately.
//
// AUTH
//   moderation.action.

import { audit, auditFireAndForget } from "@/lib/admin/audit";
import { invalidatePatternCache, type PatternKind } from "@/lib/admin/patterns";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const KIND_SET = new Set<PatternKind>([
  "content_hash",
  "ip",
  "ip_range",
  "fingerprint",
  "keyword_regex",
  "phash",
]);

function newId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${prefix}-${ts}-${rnd}`;
}

export async function GET(req: Request) {
  await requirePerm(req, "moderation.review");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "no service role" }, { status: 503 });
  }
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  let q = supa
    .from("pattern_bans")
    .select("id, kind, value, reason, created_by, created_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (kind && KIND_SET.has(kind as PatternKind)) {
    q = q.eq("kind", kind);
  }
  const { data, error } = await q;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request) {
  const { adminId } = await requirePerm(req, "moderation.action");

  let body: {
    kind?: string;
    value?: string;
    reason?: string;
    expiresAt?: string;
    fromQueueId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const kind = body.kind as PatternKind | undefined;
  const value = (body.value ?? "").trim();
  if (!kind || !KIND_SET.has(kind) || !value) {
    return Response.json(
      { ok: false, error: "Body must be { kind, value }." },
      { status: 400 }
    );
  }

  // Quick regex sanity check so an admin can't store a pattern that throws
  // at evaluate-time and bricks every classification.
  if (kind === "keyword_regex") {
    try {
      new RegExp(value, "iu");
    } catch (e) {
      return Response.json(
        { ok: false, error: `Invalid regex: ${(e as Error).message}` },
        { status: 400 }
      );
    }
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "no service role" }, { status: 503 });
  }

  const id = newId("pat");
  const before = null;
  const after = { kind, value, reason: body.reason ?? null };

  return audit(
    "moderation.pattern_ban_add",
    { kind: "pattern_ban", id },
    { before, after },
    async () => {
      const { error } = await supa.from("pattern_bans").insert({
        id,
        kind,
        value,
        reason: body.reason ?? null,
        created_by: adminId,
        expires_at: body.expiresAt ?? null,
      });
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      invalidatePatternCache();

      // If the ban was applied from a queue row, also auto-reject that row
      // so the deny-list takeover is visible without a re-classify.
      if (body.fromQueueId) {
        const nowIso = new Date().toISOString();
        await supa
          .from("moderation_queue")
          .update({
            status: "rejected",
            admin_decision: "reject",
            decided_by: adminId,
            decided_at: nowIso,
          })
          .eq("id", body.fromQueueId);
        auditFireAndForget(
          "moderation.pattern_ban_apply_to_queue",
          { kind: "moderation_queue", id: body.fromQueueId },
          { after: { banId: id } }
        );
      }

      return Response.json({ ok: true, id });
    }
  );
}
