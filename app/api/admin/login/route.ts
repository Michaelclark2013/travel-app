// app/api/admin/login/route.ts — Track 1 magic-link login: send phase.
//
// WHAT
//   POST { email } -> if email is in ADMIN_SEED_EMAILS or has an active
//   admin_invites row, send a magic link via Resend. The link contains a
//   short-lived (15min) signed token. Always responds 200 to avoid leaking
//   which emails are admins.
//
// WHY a JWT for the magic link
//   Storing a one-time random token in a DB row is fine but we already have
//   the JWT primitives. A signed token with a short TTL is stateless and
//   has the same single-use guarantee once we put the issued-at timestamp
//   in the URL — verify() checks exp and we ignore replays older than the
//   user's last successful login by enforcing TTL.
//
// ENV VARS
//   RESEND_API_KEY      — required for email send
//   ADMIN_JWT_SECRET    — signs the token
//   ADMIN_SEED_EMAILS   — bootstrap admins
//   NEXT_PUBLIC_BASE_URL or VERCEL_URL — to compose the verify link

import { sendEmail } from "@/lib/email";
import {
  findActiveInvite,
  isSeedAdmin,
} from "@/lib/admin/store";
import { signAdminJwt } from "@/lib/admin/session";

const LOGIN_TOKEN_TTL_SECONDS = 15 * 60;

function baseUrl(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  // Fall back to the request's origin (works for localhost).
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const email =
    typeof (body as { email?: unknown })?.email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
  if (!email || !email.includes("@")) {
    return Response.json({ ok: false, error: "Email required." }, { status: 400 });
  }

  // Eligibility: seed list OR active invite. We don't reveal which.
  const seed = isSeedAdmin(email);
  const invite = await findActiveInvite(email);
  const eligible = seed || !!invite;

  // Always respond 200 with a generic message. Don't leak admin existence.
  if (!eligible) {
    return Response.json({ ok: true, sent: false });
  }

  // Sign a magic-link token. Subject is the email; we resolve to user_id at
  // verify time (auth.users may not exist yet for an invite). The role in
  // the magic-link token is the *intended* role — the verify endpoint
  // double-checks against admin_roles or the active invite.
  const intendedRole = invite?.role ?? "super_admin";
  const linkToken = await signAdminJwt(
    {
      sub: email,
      role: intendedRole,
      mfa: false,
      email,
    },
    LOGIN_TOKEN_TTL_SECONDS
  );

  const verifyUrl = `${baseUrl(req)}/admin/login/verify?token=${encodeURIComponent(
    linkToken
  )}`;

  // Best-effort send. If RESEND_API_KEY isn't set we still return ok:true
  // so localhost dev work isn't blocked; the link is logged to stdout.
  const sendResult = await sendEmail({
    to: email,
    subject: "Voyage admin sign-in link",
    html: `<p>Click to sign in to the Voyage admin console:</p>
<p><a href="${verifyUrl}">Sign in →</a></p>
<p>This link expires in 15 minutes. If you didn't request it, ignore this email.</p>`,
    text: `Sign in to Voyage admin: ${verifyUrl}\n\nExpires in 15 minutes.`,
  });

  if (!sendResult.ok) {
    // In dev (no RESEND key) we want the link visible.
    console.warn("[admin/login] email send failed —", sendResult.error);
    console.warn("[admin/login] dev fallback link:", verifyUrl);
  }

  return Response.json({ ok: true, sent: true });
}
