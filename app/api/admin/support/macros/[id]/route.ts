// app/api/admin/support/macros/[id]/route.ts — Track 7 single canned-reply update/delete.
//
// AUTH: support.reply

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "support.reply");
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (typeof obj.name === "string") update.name = obj.name.trim();
  if (typeof obj.body === "string") update.body = obj.body.trim();
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
  const { error } = await supa.from("canned_replies").update(update).eq("id", id);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "support.reply");
  const { id } = await ctx.params;
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  const { error } = await supa.from("canned_replies").delete().eq("id", id);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
