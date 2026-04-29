// app/api/admin/incidents/[id]/updates/route.ts — Track 6 incident timeline.
//
// WHAT
//   GET  -> list updates for an incident (admin view).
//   POST { body } -> append an update.
//
// AUTH
//   Requires flags.write to post; flags.read to list.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "flags.read");
  const { id } = await params;
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  const { data, error } = await supa
    .from("incident_updates")
    .select("*")
    .eq("incident_id", id)
    .order("posted_at", { ascending: false });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, updates: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { adminId } = await requirePerm(req, "flags.write");
  const { id } = await params;
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  if (!body || !body.body) {
    return Response.json(
      { ok: false, error: "Body must include `body`." },
      { status: 400 }
    );
  }
  const row = {
    incident_id: id,
    body: body.body,
    posted_by: adminId,
  };
  return audit(
    "incident.update.post",
    { kind: "incident", id },
    { before: null, after: row },
    async () => {
      const { data, error } = await supa
        .from("incident_updates")
        .insert(row)
        .select("*")
        .single();
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true, update: data });
    }
  );
}
