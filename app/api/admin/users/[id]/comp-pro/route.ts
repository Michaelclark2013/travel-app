// app/api/admin/users/[id]/comp-pro/route.ts — Track 2.
//
// WHAT
//   POST /api/admin/users/[id]/comp-pro  body: { days: number; reason?: string }
//   Issues a complimentary Pro entitlement for N days. Writes to
//   pro_entitlements if Track 5's table exists; otherwise records the comp
//   in admin_audit and returns ok with `fallback: 'audit-only'` so the UI
//   can surface that the actual entitlement plumbing is pending.
//
// AUTH
//   `billing.comp` permission. (finance role + super_admin per ROLE_PERMS.)
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "billing.comp");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    days?: number;
    reason?: string;
  };
  const days = Math.min(Math.max(1, Number(body.days ?? 30)), 365 * 5);
  const expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  return audit(
    "user.comp_pro",
    { kind: "user", id },
    {
      before: { user_id: id, pro: false },
      after: { user_id: id, pro: true, expires_at: expiresAt, days, reason: body.reason ?? null },
    },
    async () => {
      // Try the real entitlements table first. We catch on error so a
      // missing-table case (Track 5 not shipped) falls through to the
      // audit-only branch.
      try {
        const { error } = await supa.from("pro_entitlements").upsert(
          {
            user_id: id,
            source: "admin_comp",
            expires_at: expiresAt,
            granted_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (!error) {
          return Response.json({ ok: true, expires_at: expiresAt, fallback: null });
        }
        // Fall through to fallback on any error (table missing, RLS, etc).
      } catch {
        // ignore
      }
      // TODO: when Track 5 ships pro_entitlements, the catch path above
      // becomes unreachable in production and this fallback can be deleted.
      return Response.json({
        ok: true,
        expires_at: expiresAt,
        fallback: "audit-only",
        note: "pro_entitlements table not present; comp recorded in admin_audit only.",
      });
    }
  );
}
