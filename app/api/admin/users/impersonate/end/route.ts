// app/api/admin/users/impersonate/end/route.ts — Track 2.
//
// WHAT
//   POST /api/admin/users/impersonate/end
//   Clears the voyage_impersonation cookie, audit-logs the end, and
//   returns 200. The user-facing banner calls this from its End-session
//   button.
//
// AUTH
//   No requirePerm call — the impersonation cookie itself is the
//   authorization to terminate it. Anyone holding it can end the session
//   (which is the safe default).
//
// ENV VARS
//   ADMIN_JWT_SECRET (for cookie verification on read).

import { auditFireAndForget } from "@/lib/admin/audit";
import {
  buildClearImpersonationCookie,
  getImpersonationFromRequest,
} from "@/lib/admin/impersonation";

export async function POST(req: Request) {
  const session = await getImpersonationFromRequest(req);
  if (session) {
    auditFireAndForget(
      "user.impersonate.end",
      { kind: "user", id: session.sub },
      {
        before: { admin_id: session.voyage_impersonator },
        after: null,
      }
    );
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildClearImpersonationCookie(),
    },
  });
}
