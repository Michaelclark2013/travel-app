// app/api/admin/incidents/[id]/route.ts — Track 6 incident PATCH (status/resolve).
//
// WHAT
//   PATCH { status?, title?, severity?, public?, resolved_at? } — partial
//   update of an incident. Setting status to "resolved" auto-fills
//   resolved_at if not supplied.
//
// AUTH
//   Requires flags.write.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "flags.write");
  const { id } = await params;
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ ok: false, error: "Body required." }, { status: 400 });
  }

  const allowed = ["title", "severity", "status", "public", "resolved_at"] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  if (patch.status === "resolved" && !("resolved_at" in patch)) {
    patch.resolved_at = new Date().toISOString();
  }

  const { data: before } = await supa
    .from("incidents")
    .select("*")
    .eq("id", id)
    .single();

  return audit(
    "incident.update",
    { kind: "incident", id },
    { before, after: { ...before, ...patch } },
    async () => {
      const { data, error } = await supa
        .from("incidents")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true, incident: data });
    }
  );
}
