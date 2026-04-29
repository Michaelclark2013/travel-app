// app/api/admin/mfa/setup/route.ts — Track 1 MFA enrollment endpoints.
//
// WHAT
//   GET  -> returns a fresh otpauth URL + the raw base32 secret (the page
//           renders the QR + a copy-paste fallback). The secret is also
//           held in the response and ECHOED back when the user POSTs the
//           verification code; we don't persist until verification succeeds.
//   POST { secret, code } ->
//           verifyTotp(secret, code). On success: encrypt the secret, store
//           it in admin_roles, flip mfa_enrolled = true, re-mint the cookie
//           with mfa: true. On failure: 400.
//
// AUTH
//   The caller MUST already have a voyage_admin cookie (logged in via magic
//   link). MFA setup is only callable in the "have cookie but mfa is false"
//   state — we check.
//
// ENV VARS
//   ADMIN_JWT_SECRET (signs the cookie, derives the AES key).

import {
  buildAdminCookie,
  getAdminFromRequest,
  signAdminJwt,
} from "@/lib/admin/session";
import {
  encryptSecret,
  generateSecret,
  otpauthUrl,
  verifyTotp,
} from "@/lib/admin/mfa";
import { setMfaSecret } from "@/lib/admin/store";
import { auditFireAndForget } from "@/lib/admin/audit";

export async function GET(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) {
    return Response.json(
      { ok: false, error: "Sign in first." },
      { status: 401 }
    );
  }
  if (session.mfa) {
    return Response.json(
      { ok: false, error: "MFA already enrolled." },
      { status: 400 }
    );
  }
  const secret = generateSecret();
  const label = session.email ?? session.adminId;
  const url = otpauthUrl(label, secret);
  return Response.json({ ok: true, secret, otpauthUrl: url });
}

export async function POST(req: Request) {
  const session = await getAdminFromRequest(req);
  if (!session) {
    return Response.json(
      { ok: false, error: "Sign in first." },
      { status: 401 }
    );
  }
  if (session.mfa) {
    return Response.json(
      { ok: false, error: "MFA already enrolled." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const secret =
    typeof (body as { secret?: unknown })?.secret === "string"
      ? (body as { secret: string }).secret
      : "";
  const code =
    typeof (body as { code?: unknown })?.code === "string"
      ? (body as { code: string }).code
      : "";

  if (!secret || !code) {
    return Response.json(
      { ok: false, error: "Missing secret or code." },
      { status: 400 }
    );
  }
  if (!verifyTotp(secret, code, 1)) {
    return Response.json(
      { ok: false, error: "Code didn't verify. Try again." },
      { status: 400 }
    );
  }

  const encrypted = encryptSecret(secret);
  const ok = await setMfaSecret(session.adminId, encrypted, true);
  if (!ok) {
    return Response.json(
      { ok: false, error: "Failed to persist MFA secret." },
      { status: 500 }
    );
  }

  // Re-mint cookie with mfa: true so the next request passes the gate.
  const newToken = await signAdminJwt({
    sub: session.adminId,
    role: session.role,
    mfa: true,
    email: session.email,
  });

  auditFireAndForget(
    "admin.mfa.enroll",
    { kind: "admin", id: session.adminId },
    { after: { mfaEnrolled: true } }
  );

  return new Response(JSON.stringify({ ok: true, redirectTo: "/admin" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildAdminCookie(newToken),
    },
  });
}
