// app/api/admin/compliance/retention/route.ts — Track 8.
//
// GET    → list policies (table + ttl + last run + last purged).
// PATCH  body: { table_name, ttl_days } → update one policy. Audited.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  await requirePerm(req, "compliance.read");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }
  const { data, error } = await supa
    .from("retention_policies")
    .select("table_name, ttl_days, last_run_at, last_purged, updated_at")
    .order("table_name");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, rows: data ?? [] });
}

export async function PATCH(req: Request) {
  await requirePerm(req, "compliance.action");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  let body: { table_name?: string; ttl_days?: number } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const tableName = body.table_name?.trim();
  const ttlDays = Number(body.ttl_days);
  if (!tableName || !Number.isFinite(ttlDays) || ttlDays <= 0) {
    return Response.json(
      { ok: false, error: "table_name + positive ttl_days required" },
      { status: 400 }
    );
  }

  const { data: before } = await supa
    .from("retention_policies")
    .select("table_name, ttl_days")
    .eq("table_name", tableName)
    .maybeSingle();

  return audit(
    "compliance.retention.update",
    { kind: "retention", id: tableName },
    { before, after: { table_name: tableName, ttl_days: ttlDays } },
    async () => {
      const { error } = await supa
        .from("retention_policies")
        .upsert(
          { table_name: tableName, ttl_days: ttlDays, updated_at: new Date().toISOString() },
          { onConflict: "table_name" }
        );
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true });
    }
  );
}
