// app/api/admin/logout/route.ts — Track 1 admin sign-out.
//
// WHAT
//   POST -> clears the voyage_admin cookie. Always returns 200.
//
// ENV VARS
//   None. (Cookie clear sets Max-Age=0 unconditionally.)

import { buildClearAdminCookie } from "@/lib/admin/session";
import { auditFireAndForget } from "@/lib/admin/audit";
import { getAdminFromRequest } from "@/lib/admin/session";

export async function POST(req: Request) {
  const session = await getAdminFromRequest(req).catch(() => null);
  if (session) {
    auditFireAndForget(
      "admin.logout",
      { kind: "admin", id: session.adminId },
      {}
    );
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildClearAdminCookie(),
    },
  });
}
