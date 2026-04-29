// app/api/admin/users/[id]/suspend/route.ts — Track 2.
//
// WHAT
//   POST /api/admin/users/[id]/suspend  body: { hours?: number; reason?: string }
//   POST /api/admin/users/[id]/suspend  body: { restore: true }
//
// AUTH
//   `users.suspend` permission. Audit-logged via lib/admin/audit.ts.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type AuthAdmin = {
  updateUserById: (
    id: string,
    payload: Record<string, unknown>
  ) => Promise<{ data: { user: { banned_until?: string | null } | null } | null; error: { message: string } | null }>;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "users.suspend");
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as {
    hours?: number;
    reason?: string;
    restore?: boolean;
  };

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const adminAuth = supa.auth.admin as unknown as AuthAdmin;

  if (body.restore) {
    return audit(
      "user.restore",
      { kind: "user", id },
      { before: { suspended: true }, after: { suspended: false } },
      async () => {
        // The Supabase admin SDK takes either a "none" string or null to
        // clear the ban. We pass "none" which is the documented value.
        const { error } = await adminAuth.updateUserById(id, {
          ban_duration: "none",
        });
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        return Response.json({ ok: true, restored: true });
      }
    );
  }

  const hours = Math.min(Math.max(1, Number(body.hours ?? 24)), 24 * 365);
  const banUntil = new Date(Date.now() + hours * 3600 * 1000).toISOString();

  return audit(
    "user.suspend",
    { kind: "user", id },
    {
      before: { banned_until: null },
      after: { banned_until: banUntil, reason: body.reason ?? null, hours },
    },
    async () => {
      const { error } = await adminAuth.updateUserById(id, {
        ban_duration: `${hours}h`,
      });
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true, banned_until: banUntil });
    }
  );
}
