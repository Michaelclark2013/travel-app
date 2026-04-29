// app/api/admin/compliance/dsar/route.ts — Track 8 DSAR inbox API.
//
// GET ?status=&kind=  → list of DSAR requests (newest first).
// POST                → admins create a DSAR on behalf of a user (rare —
//                       most DSARs come in via the user-facing form, but
//                       privacy@voyage.app emails get logged here too).

import { requirePerm } from "@/lib/admin/rbac";
import { auditFireAndForget } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  await requirePerm(req, "compliance.read");

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");

  let q = supa
    .from("dsar_requests")
    .select("id, user_id, kind, status, requested_at, fulfilled_at, expires_at, download_url, notes")
    .order("requested_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  if (kind) q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request) {
  const { adminId } = await requirePerm(req, "compliance.action");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  let body: { userId?: string; kind?: string; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const userId = body.userId?.trim();
  const kind = body.kind?.trim();
  if (!userId || (kind !== "export" && kind !== "erasure")) {
    return Response.json({ ok: false, error: "userId + kind('export'|'erasure') required" }, { status: 400 });
  }

  const id = `dsar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supa.from("dsar_requests").insert({
    id,
    user_id: userId,
    kind,
    status: "received",
    requested_at: new Date().toISOString(),
    notes: body.notes ?? `Filed by admin ${adminId}.`,
  });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  auditFireAndForget("compliance.dsar.create", { kind: "dsar", id }, { after: { userId, kind } });
  return Response.json({ ok: true, id });
}
