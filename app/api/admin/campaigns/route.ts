// app/api/admin/campaigns/route.ts — Track 7 outbound-campaigns list + create.
//
// GET ?kind=push|email|banner -> { rows }
// POST { kind, name, target, body, scheduled_at? } -> { id }
//
// AUTH: support.read for GET, support.broadcast for POST.

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { newId } from "@/lib/admin/support";

const KINDS = new Set(["push", "email", "banner"]);

export async function GET(req: Request) {
  await requirePerm(req, "support.read");
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  let q = supa
    .from("outbound_campaigns")
    .select(
      "id, kind, name, status, target, body, scheduled_at, sent_at, sent_count, created_by, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (kind && KINDS.has(kind)) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request) {
  const { adminId } = await requirePerm(req, "support.broadcast");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const kind = typeof obj.kind === "string" ? obj.kind : "";
  if (!KINDS.has(kind)) {
    return Response.json({ ok: false, error: "Invalid kind." }, { status: 422 });
  }
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) {
    return Response.json({ ok: false, error: "name is required." }, { status: 422 });
  }
  const target = (obj.target && typeof obj.target === "object" ? obj.target : { kind: "all" }) as Record<string, unknown>;
  const payload = (obj.body && typeof obj.body === "object" ? obj.body : {}) as Record<string, unknown>;
  const scheduled = typeof obj.scheduled_at === "string" ? obj.scheduled_at : null;
  const status = scheduled ? "scheduled" : "draft";

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  const id = newId("cmp");
  return audit(
    "campaign.create",
    { kind: "campaign", id },
    { before: null, after: { kind, name, target, body: payload, status, scheduled_at: scheduled } },
    async () => {
      const { error } = await supa.from("outbound_campaigns").insert({
        id,
        kind,
        name,
        status,
        target,
        body: payload,
        scheduled_at: scheduled,
        created_by: adminId,
      });
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true, id }, { status: 201 });
    }
  );
}
