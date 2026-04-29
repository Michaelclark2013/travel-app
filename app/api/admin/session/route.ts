// app/api/admin/session/route.ts — Track 1 current-admin probe.
//
// WHAT
//   GET -> returns { session: { adminId, role, mfa, email } | null } based
//   on the voyage_admin cookie. Used by useAdminSession() to populate the
//   client cache.
//
// WHY
//   The cookie is httpOnly, so the client can't read it directly. This
//   endpoint is the only way client code can know who the admin is.
//
// ENV VARS
//   ADMIN_JWT_SECRET.

import { getAdminFromRequest } from "@/lib/admin/session";

export async function GET(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) {
    return Response.json({ session: null }, { status: 200 });
  }
  return Response.json(
    {
      session: {
        adminId: session.adminId,
        role: session.role,
        mfa: session.mfa,
        email: session.email,
      },
    },
    { status: 200 }
  );
}
