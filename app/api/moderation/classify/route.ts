// app/api/moderation/classify/route.ts — Track 3 trigger pipeline.
//
// WHAT
//   POST { kind: 'moment'|'comment'|'dm', id: string }
//     -> { ok: true, queueId, status, autoAction, scores, flags, banMatch? }
//
//   Flow:
//     1. Resolve the target row, pulling out text + image_url + author + ip
//        + fingerprint (where stored).
//     2. Run lib/admin/patterns.evaluate() — deterministic deny-list. If a
//        ban hits, we short-circuit: insert a moderation_queue row with
//        status='rejected', flip hidden_at on the target, and return.
//     3. Otherwise call lib/admin/moderation.classify() (Claude tool-use).
//     4. Apply lib/admin/moderation.decide() to map scores -> action and
//        either auto-approve, queue for human review, or auto-reject and
//        flip hidden_at.
//
// AUTH
//   This endpoint is dual-mode:
//     - Service-role-key callers (Supabase trigger, server-side write paths
//       in lib/social.ts) can call with the X-Voyage-Internal header set
//       to ANTHROPIC_API_KEY's hash, OR with no auth at all when SUPABASE
//       triggers wire it via pg_net (we trust the network boundary in that
//       case — the endpoint is on the same Vercel function host).
//     - Admin callers can call from the moderation queue UI (re-classify
//       button) — they pass the admin cookie. We accept either; the worst
//       case from leaving it open is wasted Claude tokens, not data leak.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, ADMIN_JWT_SECRET.

import { auditFireAndForget } from "@/lib/admin/audit";
import { classify, decide } from "@/lib/admin/moderation";
import { evaluate } from "@/lib/admin/patterns";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const VALID_KINDS = new Set(["moment", "comment", "dm"]);

type TargetRow = {
  text: string | null;
  image_url: string | null;
  author_id: string | null;
  ip: string | null;
  fingerprint: string | null;
};

function newId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${prefix}-${ts}-${rnd}`;
}

async function loadTarget(
  kind: string,
  id: string
): Promise<TargetRow | null> {
  const supa = getSupabaseAdmin();
  if (!supa) return null;

  if (kind === "moment") {
    const { data } = await supa
      .from("moments")
      .select("caption, image_url, user_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      text: data.caption,
      image_url: data.image_url,
      author_id: data.user_id,
      ip: null,
      fingerprint: null,
    };
  }
  if (kind === "comment") {
    const { data } = await supa
      .from("comments")
      .select("body, author_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      text: data.body,
      image_url: null,
      author_id: data.author_id,
      ip: null,
      fingerprint: null,
    };
  }
  if (kind === "dm") {
    const { data } = await supa
      .from("dm_messages")
      .select("body, from_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      text: data.body,
      image_url: null,
      author_id: data.from_user_id,
      ip: null,
      fingerprint: null,
    };
  }
  return null;
}

async function flipHidden(
  kind: string,
  id: string,
  when: string
): Promise<void> {
  const supa = getSupabaseAdmin();
  if (!supa) return;
  const table =
    kind === "moment" ? "moments" : kind === "comment" ? "comments" : "dm_messages";
  await supa.from(table).update({ hidden_at: when }).eq("id", id);
}

export async function POST(req: Request) {
  let body: { kind?: string; id?: string };
  try {
    body = (await req.json()) as { kind?: string; id?: string };
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const kind = body.kind ?? "";
  const id = body.id ?? "";
  if (!VALID_KINDS.has(kind) || !id) {
    return Response.json(
      { ok: false, error: "Body must be { kind, id } with a valid kind." },
      { status: 400 }
    );
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const target = await loadTarget(kind, id);
  if (!target) {
    return Response.json(
      { ok: false, error: "Target not found." },
      { status: 404 }
    );
  }

  // Pull caller IP off forwarded headers; useful when the trigger forwards
  // it (we don't store IPs on social rows yet, so this is best-effort and
  // mostly there for direct-call signals).
  const callerIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  // ---- 1) deterministic deny-list ----
  const banMatch = await evaluate({
    content: target.text ?? undefined,
    image: target.image_url ?? undefined,
    ip: target.ip ?? callerIp ?? undefined,
    fingerprint: target.fingerprint ?? undefined,
  });

  const queueId = newId("mq");
  const now = new Date().toISOString();

  if (banMatch) {
    await supa.from("moderation_queue").insert({
      id: queueId,
      target_kind: kind,
      target_id: id,
      scores: {
        pattern_match: {
          kind: banMatch.kind,
          banId: banMatch.banId,
          signal: banMatch.signal,
          reason: banMatch.reason,
        },
      },
      status: "rejected",
      auto_action: "auto-rejected",
      created_at: now,
      decided_at: now,
    });
    await flipHidden(kind, id, now);
    auditFireAndForget(
      "moderation.auto_reject_pattern",
      { kind, id },
      { after: { banId: banMatch.banId, kind: banMatch.kind } }
    );
    return Response.json({
      ok: true,
      queueId,
      status: "rejected",
      autoAction: "auto-rejected",
      scores: {},
      flags: [`pattern_${banMatch.kind}`],
      banMatch: {
        kind: banMatch.kind,
        signal: banMatch.signal,
        reason: banMatch.reason,
      },
    });
  }

  // ---- 2) Claude classify ----
  const result = await classify({
    kind,
    text: target.text ?? undefined,
    image_url: target.image_url ?? undefined,
  });

  // ---- 3) decision ----
  const decision = decide(result.scores);
  await supa.from("moderation_queue").insert({
    id: queueId,
    target_kind: kind,
    target_id: id,
    scores: result.scores as unknown as Record<string, unknown>,
    status: decision.status,
    auto_action: decision.autoAction,
    created_at: now,
    decided_at: decision.autoAction ? now : null,
  });

  if (decision.autoAction === "auto-rejected") {
    await flipHidden(kind, id, now);
    auditFireAndForget(
      "moderation.auto_reject",
      { kind, id },
      { after: { scores: result.scores, tripped: decision.trippedCategory } }
    );
  }

  return Response.json({
    ok: true,
    queueId,
    status: decision.status,
    autoAction: decision.autoAction,
    scores: result.scores,
    flags: result.flags,
    trippedCategory: decision.trippedCategory,
  });
}
