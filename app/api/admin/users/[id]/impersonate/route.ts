// app/api/admin/users/[id]/impersonate/route.ts — Track 2 impersonation start.
//
// WHAT
//   POST /api/admin/users/[id]/impersonate
//   Mints a 30-minute voyage_impersonation cookie carrying:
//     { sub: <target_user_id>, voyage_impersonator: <admin_id>, exp }
//   Audit-logs the start, then 302-redirects to "/" so the admin lands on
//   the user-facing app. The user-facing <AuthProvider> + a small banner
//   client read this cookie via /api/admin/users/impersonate/me and render
//   "Voyage support is helping you · End session" while it's present.
//
// AUTH
//   super_admin only — gated by requirePerm(req, "users.impersonate").
//   Per the brief: "Capped at 30 minutes via JWT exp. super_admin only."
//   ROLE_PERMS currently grants users.impersonate to support too; if the
//   team lead wants the harder restriction we add an explicit role check
//   below.
//
// ENV VARS
//   ADMIN_JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY.

import { auditFireAndForget } from "@/lib/admin/audit";
import {
  buildImpersonationCookie,
  IMPERSONATION_MAX_TTL_SECONDS,
  signImpersonationJwt,
} from "@/lib/admin/impersonation";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type AuthAdmin = {
  getUserById?: (
    id: string
  ) => Promise<{ data: { user: { email?: string | null } | null } | null }>;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  // Per brief: super_admin only. We enforce this twice — first via the
  // permission slug, second via an explicit role check so a future
  // ROLE_PERMS edit can't loosen impersonation by accident.
  const session = await requirePerm(req, "users.impersonate");
  if (session.role !== "super_admin") {
    return Response.json(
      { ok: false, error: "impersonation is super_admin only" },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;

  // Confirm the target user exists. We grab their email so the banner can
  // show "you are signed in as <name>".
  const supa = getSupabaseAdmin();
  let email: string | null = null;
  if (supa) {
    const adminAuth = supa.auth.admin as unknown as AuthAdmin;
    if (adminAuth.getUserById) {
      const { data } = await adminAuth.getUserById(id);
      email = data?.user?.email ?? null;
    }
  }

  // Mint the 30-minute token.
  const token = await signImpersonationJwt(
    {
      sub: id,
      voyage_impersonator: session.adminId,
      email: email ?? undefined,
    },
    IMPERSONATION_MAX_TTL_SECONDS
  );

  // Audit-log fire-and-forget — separate row, not a wrapped mutation.
  auditFireAndForget(
    "user.impersonate.start",
    { kind: "user", id },
    {
      before: null,
      after: {
        admin_id: session.adminId,
        target_user_id: id,
        ttl_seconds: IMPERSONATION_MAX_TTL_SECONDS,
      },
    }
  );

  // 303 See Other so the browser GETs / next.
  const redirect = new URL("/", req.url);
  return new Response(null, {
    status: 303,
    headers: {
      Location: redirect.toString(),
      "Set-Cookie": buildImpersonationCookie(token),
    },
  });
}
