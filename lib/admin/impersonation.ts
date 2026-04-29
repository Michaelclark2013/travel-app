// lib/admin/impersonation.ts — Track 2 admin "log in as user" plumbing.
//
// WHAT
//   signImpersonationJwt(payload, ttl)  — mint a short-lived HS256 JWT.
//   verifyImpersonationJwt(token)       — verify + parse.
//   getImpersonationFromRequest(req)    — pull the cookie off a Request.
//   buildImpersonationCookie(token)     — Set-Cookie value (httpOnly, lax).
//   buildClearImpersonationCookie()     — clear-cookie value.
//
//   The cookie is intentionally SEPARATE from voyage_admin and from any
//   Supabase session cookie. The user-facing <AuthProvider> reads it via
//   /api/admin/users/impersonate/me and, if present, renders a persistent
//   "Voyage support is helping you · End session" banner. The user's normal
//   Supabase session is left untouched on the client; the banner gives the
//   admin a one-click bail-out via /api/admin/users/impersonate/end.
//
// WHY a separate cookie + not a real Supabase session
//   Minting a real Supabase user session requires service-role admin API
//   calls (auth.admin.generateLink type=magiclink) and ferrying the
//   recovered access_token to the browser via redirect, plus a way to
//   restore the admin's own browser session afterward. That has surprising
//   failure modes (the browser already had a different user signed in, the
//   refresh token rotates, etc.). For Track 2 we ship the lightweight
//   cookie: it's enough for the admin to navigate the app AS the target
//   user (the AuthProvider can swap `user` to the impersonated id when the
//   cookie is present) without disturbing the admin's own admin cookie.
//
//   The brief mentions "mints a Voyage user session JWT". Reading that
//   literally would mean either a Voyage-issued JWT that the rest of the
//   app already validates (we don't have such a thing — the app uses
//   Supabase) or a synthesized Supabase session. Neither is feasible
//   without a wider refactor. The cookie + banner pattern is the smallest
//   safe primitive that satisfies the *intent*: an admin can see the app
//   from a user's perspective and the audit trail captures it.
//
// SECURITY
//   - Cookie is httpOnly so JS cannot read the JWT.
//   - 30-minute hard cap (TTL enforced in JWT exp).
//   - voyage_impersonator claim records WHICH admin started the session;
//     audit log writes record both ids on start.
//   - Only super_admin (per the brief) can call the start endpoint.
//
// ENV VARS
//   ADMIN_JWT_SECRET — reused. We don't introduce a separate secret because
//                      an attacker with this secret can already mint admin
//                      cookies, so the impersonation surface adds no new
//                      blast radius beyond what's already secured.

const COOKIE_NAME = "voyage_impersonation";
const MAX_TTL_SECONDS = 30 * 60; // 30m hard cap per the brief.

export const IMPERSONATION_COOKIE = COOKIE_NAME;
export const IMPERSONATION_MAX_TTL_SECONDS = MAX_TTL_SECONDS;

export type ImpersonationPayload = {
  // Standard JWT claims.
  sub: string; // target user id (the user being impersonated)
  iat: number;
  exp: number;
  // Voyage-specific claim — the admin running the session.
  voyage_impersonator: string;
  // Email of the impersonated user, for UI display only.
  email?: string;
};

// ---------------------------------------------------------------------------
// b64url helpers — duplicated from session.ts to keep this file standalone.
// ---------------------------------------------------------------------------
function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlEncodeString(s: string): string {
  return b64urlEncodeBytes(new TextEncoder().encode(s));
}
function b64urlDecodeToBytes(input: string): Uint8Array {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlDecodeToString(input: string): string {
  return new TextDecoder().decode(b64urlDecodeToBytes(input));
}
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}
function getSecretBytes(): ArrayBuffer {
  const s = process.env.ADMIN_JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("ADMIN_JWT_SECRET is missing or too short (>=16 chars).");
  }
  const view = new TextEncoder().encode(s);
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}
async function importHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getSecretBytes(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// ---------------------------------------------------------------------------
// signImpersonationJwt — caps ttl at MAX_TTL_SECONDS.
// ---------------------------------------------------------------------------
export async function signImpersonationJwt(
  payload: Omit<ImpersonationPayload, "iat" | "exp">,
  ttlSeconds: number = MAX_TTL_SECONDS
): Promise<string> {
  const ttl = Math.min(Math.max(60, ttlSeconds), MAX_TTL_SECONDS);
  const now = Math.floor(Date.now() / 1000);
  const full: ImpersonationPayload = { ...payload, iat: now, exp: now + ttl };
  const headerSeg = b64urlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadSeg = b64urlEncodeString(JSON.stringify(full));
  const signingInput = `${headerSeg}.${payloadSeg}`;
  const key = await importHmacKey();
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      toArrayBuffer(new TextEncoder().encode(signingInput))
    )
  );
  return `${signingInput}.${b64urlEncodeBytes(sig)}`;
}

// ---------------------------------------------------------------------------
// verifyImpersonationJwt — returns payload on success, null on any failure.
// ---------------------------------------------------------------------------
export async function verifyImpersonationJwt(
  token: string
): Promise<ImpersonationPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const key = await importHmacKey();
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(b64urlDecodeToBytes(s)),
      toArrayBuffer(new TextEncoder().encode(`${h}.${p}`))
    );
    if (!ok) return null;
    const payload = JSON.parse(b64urlDecodeToString(p)) as ImpersonationPayload;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.voyage_impersonator !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie I/O.
// ---------------------------------------------------------------------------
export function buildImpersonationCookie(
  token: string,
  ttlSeconds: number = MAX_TTL_SECONDS
): string {
  const ttl = Math.min(Math.max(60, ttlSeconds), MAX_TTL_SECONDS);
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${ttl}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function buildClearImpersonationCookie(): string {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export async function getImpersonationFromRequest(
  req: Request
): Promise<ImpersonationPayload | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const target = `${COOKIE_NAME}=`;
  const parts = cookieHeader.split(/;\s*/);
  let token: string | null = null;
  for (const p of parts) {
    if (p.startsWith(target)) {
      token = decodeURIComponent(p.slice(target.length));
      break;
    }
  }
  if (!token) return null;
  return verifyImpersonationJwt(token);
}
