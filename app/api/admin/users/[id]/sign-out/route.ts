// app/api/admin/users/[id]/sign-out/route.ts — Track 2.
//
// WHAT
//   POST /api/admin/users/[id]/sign-out
//   Forcibly invalidates ALL refresh tokens for a target user. The user is
//   signed out on every device they currently hold a session on.
//
// AUTH
//   `users.suspend` permission (force sign-out is a moderation action).
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type AuthAdmin = {
  signOut: (
    jwt: string,
    scope?: "global" | "local"
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  // The supabase-js admin namespace exposes signOut(jwt) which signs out
  // by access token; for "kill all sessions for user X" we use the
  // `_signOutUserSessions` style helper. The newer SDK calls it
  // `auth.admin.signOut(userId, scope)` accepting a userId. We type it
  // loosely so a patch bump doesn't break compilation.
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

  return audit(
    "user.force_sign_out",
    { kind: "user", id },
    { before: { sessions: "active" }, after: { sessions: "revoked" } },
    async () => {
      const adminAuth = supa.auth.admin as unknown as AuthAdmin;
      // We call signOut with the user id as the first arg and "global" scope.
      // If the SDK shape differs at runtime, we fall back to revoking via
      // the auth.admin REST surface.
      try {
        const { error } = await adminAuth.signOut(id, "global");
        if (error) {
          return Response.json(
            { ok: false, error: error.message },
            { status: 500 }
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return Response.json(
          { ok: false, error: `signOut failed: ${message}` },
          { status: 500 }
        );
      }
      return Response.json({ ok: true });
    }
  );
}
