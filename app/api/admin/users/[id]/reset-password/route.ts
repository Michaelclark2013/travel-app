// app/api/admin/users/[id]/reset-password/route.ts — Track 2.
//
// WHAT
//   POST /api/admin/users/[id]/reset-password
//   Generates a password-recovery magic link for the target user via
//   auth.admin.generateLink({ type: 'recovery' }). Returns the link to the
//   admin (who can copy it into a support reply) and audit-logs the action.
//
// AUTH
//   `users.suspend` permission. (We re-use suspend rather than coining a
//   new "users.reset_password" because the role matrix in lib/admin/rbac.ts
//   doesn't list one. Team lead can split this later if desired.)
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type AuthAdmin = {
  getUserById?: (
    id: string
  ) => Promise<{ data: { user: { email?: string | null } | null } | null }>;
  generateLink: (args: {
    type: string;
    email: string;
  }) => Promise<{
    data: { properties?: { action_link?: string | null } | null } | null;
    error: { message: string } | null;
  }>;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "users.suspend");
  const { id } = await ctx.params;

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const adminAuth = supa.auth.admin as unknown as AuthAdmin;
  let email: string | null = null;
  if (adminAuth.getUserById) {
    const { data } = await adminAuth.getUserById(id);
    email = data?.user?.email ?? null;
  }
  if (!email) {
    return Response.json(
      { ok: false, error: "user has no email on file" },
      { status: 400 }
    );
  }

  return audit(
    "user.reset_password",
    { kind: "user", id },
    { before: { email }, after: { email, link: "issued" } },
    async () => {
      const { data, error } = await adminAuth.generateLink({
        type: "recovery",
        email,
      });
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({
        ok: true,
        link: data?.properties?.action_link ?? null,
      });
    }
  );
}
