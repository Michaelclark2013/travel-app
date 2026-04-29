// app/api/admin/compliance/dsar/[requestId]/route.ts — single DSAR row.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ requestId: string }> }
) {
  await requirePerm(req, "compliance.read");
  const { requestId } = await ctx.params;

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  const { data, error } = await supa
    .from("dsar_requests")
    .select("id, user_id, kind, status, requested_at, fulfilled_at, expires_at, download_url, notes")
    .eq("id", requestId)
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return Response.json({ ok: false, error: "Not found" }, { status: 404 });

  // Hydrate the user's email for the receipt UI.
  let email: string | null = null;
  try {
    const u = await supa.auth.admin.getUserById(data.user_id);
    email = u.data.user?.email ?? null;
  } catch {
    /* ignore */
  }

  return Response.json({ ok: true, row: { ...data, email } });
}
