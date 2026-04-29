// app/api/admin/users/impersonate/me/route.ts — Track 2.
//
// WHAT
//   GET /api/admin/users/impersonate/me
//   Returns { active: boolean, target_user_id?: string, email?: string,
//             admin_id?: string, expires_at?: number }
//   The user-facing impersonation banner polls this on mount to decide
//   whether to render itself.
//
// AUTH
//   No gate — the cookie's presence + signature is the auth.
//
// ENV VARS
//   ADMIN_JWT_SECRET.

import { getImpersonationFromRequest } from "@/lib/admin/impersonation";

export async function GET(req: Request) {
  const session = await getImpersonationFromRequest(req);
  if (!session) {
    return Response.json({ active: false });
  }
  return Response.json({
    active: true,
    target_user_id: session.sub,
    email: session.email ?? null,
    admin_id: session.voyage_impersonator,
    expires_at: session.exp,
  });
}
