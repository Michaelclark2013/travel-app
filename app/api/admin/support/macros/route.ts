// app/api/admin/support/macros/route.ts — Track 7 canned-replies CRUD (list + create).
//
// AUTH: support.read for GET, support.reply for POST.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { newId } from "@/lib/admin/support";

export async function GET(req: Request) {
  await requirePerm(req, "support.read");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  const { data, error } = await supa
    .from("canned_replies")
    .select("id, name, body, created_by, created_at")
    .order("name", { ascending: true });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request) {
  const { adminId } = await requirePerm(req, "support.reply");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const text = typeof obj.body === "string" ? obj.body.trim() : "";
  if (!name || !text) {
    return Response.json(
      { ok: false, error: "name and body are required." },
      { status: 422 }
    );
  }
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  const id = newId("can");
  const { error } = await supa.from("canned_replies").insert({
    id,
    name,
    body: text,
    created_by: adminId,
  });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, id }, { status: 201 });
}
