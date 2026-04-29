// app/api/admin/replay/history/route.ts — Track 9 time-travel history fetch.
//
// WHAT
//   GET /api/admin/replay/history?kind=trips&id=...
//     -> { ok: true, events: [{ kind, before, after, ts }] }
//
//   Reads admin_events for a single record. The page renders a slider over
//   this list to let admins jump between historical snapshots.
//
// AUTH
//   audit.read — same baseline as the audit log. Track 1 grants this to
//   admin/super_admin/finance/support.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  await requirePerm(req, "audit.read");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!kind || !id) {
    return Response.json({ ok: false, error: "kind and id required" }, { status: 400 });
  }
  const { data, error } = await supa
    .from("admin_events")
    .select("kind,before,after,ts")
    .eq("target_kind", kind)
    .eq("target_id", id)
    .order("ts", { ascending: true })
    .limit(500);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, events: data ?? [] });
}
