// app/api/admin/campaigns/[id]/route.ts — single-campaign get/patch/delete.
//
// AUTH: support.read for GET, support.broadcast for PATCH/DELETE.

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "support.read");
  const { id } = await ctx.params;
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const [{ data: campaign }, { data: events }] = await Promise.all([
    supa
      .from("outbound_campaigns")
      .select(
        "id, kind, name, status, target, body, scheduled_at, sent_at, sent_count, created_by, created_at, updated_at"
      )
      .eq("id", id)
      .maybeSingle(),
    supa
      .from("campaign_events")
      .select("event")
      .eq("campaign_id", id),
  ]);

  if (!campaign) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const counts: Record<string, number> = {};
  for (const e of events ?? []) {
    counts[e.event as string] = (counts[e.event as string] ?? 0) + 1;
  }
  return Response.json({ ok: true, campaign, counts });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "support.broadcast");
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  for (const k of ["name", "status", "scheduled_at"] as const) {
    if (k in obj) update[k] = obj[k];
  }
  if ("target" in obj && obj.target && typeof obj.target === "object")
    update.target = obj.target;
  if ("body" in obj && obj.body && typeof obj.body === "object") update.body = obj.body;

  if (Object.keys(update).length === 0) {
    return Response.json({ ok: false, error: "Nothing to update." }, { status: 422 });
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const { data: before } = await supa
    .from("outbound_campaigns")
    .select("id, status, target, body, scheduled_at, name")
    .eq("id", id)
    .maybeSingle();
  if (!before) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  return audit(
    "campaign.update",
    { kind: "campaign", id },
    { before, after: { ...before, ...update } },
    async () => {
      const { error } = await supa.from("outbound_campaigns").update(update).eq("id", id);
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true });
    }
  );
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "support.broadcast");
  const { id } = await ctx.params;
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  return audit(
    "campaign.delete",
    { kind: "campaign", id },
    { before: { id }, after: null },
    async () => {
      const { error } = await supa.from("outbound_campaigns").delete().eq("id", id);
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true });
    }
  );
}
