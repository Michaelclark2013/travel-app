// app/api/admin/login/verify/route.ts — Track 1 magic-link verify.
//
// WHAT
//   POST { token } -> verifies the magic-link JWT, resolves the email to a
//   Supabase auth user, ensures an admin_roles row exists (creating one
//   for seed admins or the matching invite), and sets the voyage_admin
//   cookie. Returns { redirectTo: '/admin/mfa-setup' | '/admin' }.
//
// WHY a POST + JSON rather than a GET on the click
//   Magic links can be prefetched by mail clients which would burn the
//   token. Convention: the link goes to /admin/login/verify (a tiny client
//   page) which then POSTs the token from inside the user's browser.
//
// ENV VARS
//   ADMIN_JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SEED_EMAILS.

import {
  buildAdminCookie,
  signAdminJwt,
  verifyAdminJwt,
} from "@/lib/admin/session";
import {
  consumeInvite,
  findActiveInvite,
  findUserIdByEmail,
  getAdminRole,
  isSeedAdmin,
  upsertAdminRole,
} from "@/lib/admin/store";
import type { AdminRole } from "@/lib/admin/rbac";
import { auditFireAndForget } from "@/lib/admin/audit";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const token =
    typeof (body as { token?: unknown })?.token === "string"
      ? (body as { token: string }).token
      : "";
  if (!token) {
    return Response.json({ ok: false, error: "Missing token." }, { status: 400 });
  }

  const payload = await verifyAdminJwt(token);
  if (!payload || !payload.email) {
    return Response.json(
      { ok: false, error: "Link expired or invalid. Please request a new one." },
      { status: 401 }
    );
  }
  const email = payload.email.toLowerCase();

  // Resolve to auth.users.id. Magic-link sub is the email; we never trust
  // it to identify the user record.
  const userId = await findUserIdByEmail(email);
  if (!userId) {
    return Response.json(
      {
        ok: false,
        error:
          "No Supabase user for this email. Ask the team lead to provision the auth account first.",
      },
      { status: 403 }
    );
  }

  // Decide what role to assign. Order of authority:
  //   1. Existing admin_roles row (already an admin, just sign them in).
  //   2. Active invite for this email (consume it + create row).
  //   3. Seed list (super_admin bootstrap).
  let role: AdminRole | null = null;
  let mfaEnrolled = false;

  const existing = await getAdminRole(userId);
  if (existing) {
    role = existing.role;
    mfaEnrolled = existing.mfa_enrolled;
  } else {
    const invite = await findActiveInvite(email);
    if (invite) {
      role = invite.role;
      const row = await upsertAdminRole({ userId, role });
      mfaEnrolled = row?.mfa_enrolled ?? false;
      await consumeInvite(invite.token);
    } else if (isSeedAdmin(email)) {
      role = "super_admin";
      const row = await upsertAdminRole({ userId, role });
      mfaEnrolled = row?.mfa_enrolled ?? false;
    } else {
      return Response.json(
        { ok: false, error: "Not an admin." },
        { status: 403 }
      );
    }
  }

  // Mint the session cookie. mfa is set to whatever we have on file —
  // the middleware will route to /admin/mfa-setup if false.
  const sessionToken = await signAdminJwt({
    sub: userId,
    role,
    mfa: mfaEnrolled,
    email,
  });

  // Fire-and-forget audit. This is the kind of "non-mutating" event that
  // auditFireAndForget is for — the action did happen but it's not a
  // wrapped mutation.
  auditFireAndForget("admin.login", { kind: "admin", id: userId }, {
    after: { role, mfaEnrolled },
  });

  const headers = new Headers({
    "Content-Type": "application/json",
    "Set-Cookie": buildAdminCookie(sessionToken),
  });
  const redirectTo = mfaEnrolled ? "/admin" : "/admin/mfa-setup";
  return new Response(
    JSON.stringify({ ok: true, redirectTo, role, mfaEnrolled }),
    { status: 200, headers }
  );
}
