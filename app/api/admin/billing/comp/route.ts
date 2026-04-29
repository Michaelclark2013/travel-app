// app/api/admin/billing/comp/route.ts — Track 5 grant a comp.
//
// WHAT
//   POST { userId, months } -> { ok, entitlement }
//   Creates or extends a source='comp' row in pro_entitlements with
//   expires_at = max(existing.expires_at, now()) + months.
//
// AUTH
//   billing.comp.
//
// AUDIT
//   audit("billing.comp", ...) wraps the upsert.

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type Body = { userId?: string; months?: number };

export async function POST(req: Request) {
  const { adminId } = await requirePerm(req, "billing.comp");

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const userId = body.userId;
  const months = Number(body.months ?? 1);
  if (!userId || !Number.isFinite(months) || months <= 0 || months > 60) {
    return Response.json(
      { error: "userId required, months in (0,60]" },
      { status: 400 }
    );
  }

  const { data: existing } = await supa
    .from("pro_entitlements")
    .select("user_id, source, status, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  // base = max(now, existing.expires_at if comp/manual)
  const now = Date.now();
  const baseMs =
    existing && existing.source !== "stripe" && existing.expires_at
      ? Math.max(now, Date.parse(existing.expires_at))
      : now;
  const newExpiresAt = new Date(baseMs + months * 30 * 24 * 60 * 60 * 1000).toISOString();

  return audit(
    "billing.comp",
    { kind: "user", id: userId },
    {
      before: existing,
      after: {
        ...existing,
        source: "comp",
        status: "active",
        granted_by: adminId,
        expires_at: newExpiresAt,
        months,
      },
    },
    async () => {
      const { data, error } = await supa
        .from("pro_entitlements")
        .upsert(
          {
            user_id: userId,
            source: "comp",
            status: "active",
            current_period_end: newExpiresAt,
            cancel_at_period_end: false,
            granted_by: adminId,
            granted_at: new Date().toISOString(),
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select()
        .maybeSingle();
      if (error) throw error;
      return Response.json({ ok: true, entitlement: data });
    }
  );
}
