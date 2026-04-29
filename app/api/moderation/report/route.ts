// app/api/moderation/report/route.ts — Track 3 abuse-report submission.
//
// WHAT
//   POST { targetKind: 'moment'|'comment'|'dm'|'profile', targetId, reason,
//          context?: { note?, screenshots?[] } }
//     -> { ok: true, reportId }
//
//   Inserts an abuse_reports row with reporter_id pulled from the
//   Supabase access token (Authorization: Bearer ...). Triggers a
//   classify pass on the target so the moderation queue picks it up
//   immediately (fire-and-forget).
//
// AUTH
//   Any authenticated user. We pull the user id from the Bearer token by
//   verifying it through the service-role Supabase client.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL.

import { getSupabaseAdmin } from "@/lib/supabase-server";

const VALID_KINDS = new Set(["moment", "comment", "dm", "profile"]);

function newId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${prefix}-${ts}-${rnd}`;
}

async function getUserIdFromBearer(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const supa = getSupabaseAdmin();
  if (!supa) return null;
  try {
    const { data, error } = await supa.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: {
    targetKind?: string;
    targetId?: string;
    reason?: string;
    context?: Record<string, unknown>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const targetKind = body.targetKind ?? "";
  const targetId = body.targetId ?? "";
  const reason = (body.reason ?? "").trim();
  const context = body.context ?? null;

  if (!VALID_KINDS.has(targetKind) || !targetId || !reason) {
    return Response.json(
      { ok: false, error: "Body must be { targetKind, targetId, reason }." },
      { status: 400 }
    );
  }
  if (reason.length > 64) {
    return Response.json(
      { ok: false, error: "Reason must be <= 64 chars (use context.note for detail)." },
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

  const reporterId = await getUserIdFromBearer(req);
  if (!reporterId) {
    return Response.json({ ok: false, error: "Sign-in required." }, { status: 401 });
  }

  const reportId = newId("rep");
  const { error } = await supa.from("abuse_reports").insert({
    id: reportId,
    reporter_id: reporterId,
    target_kind: targetKind,
    target_id: targetId,
    reason,
    context,
  });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Kick off a classification pass — fire-and-forget so the user gets a
  // fast 200 even if Claude is slow. We only do this for content kinds the
  // classifier understands.
  if (targetKind !== "profile") {
    const origin = new URL(req.url).origin;
    void fetch(`${origin}/api/moderation/classify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: targetKind, id: targetId }),
    }).catch((e) => console.warn("[report] classify enqueue failed", e));
  }

  return Response.json({ ok: true, reportId });
}
