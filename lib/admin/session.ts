// lib/admin/session.ts — Track 1 admin session machinery.
//
// WHAT
//   Admin auth uses an httpOnly cookie called `voyage_admin` carrying a
//   compact HMAC-SHA256 JWT. This module is the single source of truth for:
//     - signAdminJwt(payload, ttl)        : mint a token
//     - verifyAdminJwt(token)             : verify + parse payload
//     - getAdminFromRequest(req)          : pull cookie off a Request, verify,
//                                           return { adminId, role, mfa }.
//
// WHY Web Crypto (not node:crypto)
//   The Next 16 `middleware.ts` file convention runs on the Edge runtime,
//   which exposes the WebCrypto SubtleCrypto API but NOT node:crypto. Using
//   the Web Crypto subset keeps this module identical in middleware,
//   server route handlers, and Server Components without runtime branching.
//
// COOKIE
//   Name      : voyage_admin
//   HttpOnly  : yes (no JS access)
//   Secure    : yes when NODE_ENV=production
//   SameSite  : lax
//   Path      : /
//   Max-Age   : 8h by default (re-authenticate at the start of each shift).
//
// ENV VARS
//   ADMIN_JWT_SECRET — symmetric key used for HMAC. Must be at least 16
//                      bytes. Never expose to the client.

export const ADMIN_COOKIE = "voyage_admin";
export const DEFAULT_TTL_SECONDS = 60 * 60 * 8; // 8h

import type { AdminRole } from "./rbac";

export type AdminJwtPayload = {
  // Standard JWT claims (subset).
  sub: string; // admin user_id (or email for the magic-link token)
  iat: number; // issued at (seconds)
  exp: number; // expires at (seconds)
  // Voyage-specific claims.
  role: AdminRole;
  mfa: boolean; // has the admin completed TOTP enrollment + verification?
  email?: string; // included for UI display only — never trusted for auth
};

// ---------------------------------------------------------------------------
// base64url helpers — JWT canonical encoding.
// We avoid Buffer here so the module stays Edge-runtime compatible.
// ---------------------------------------------------------------------------
function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  // btoa is available in both Node 18+ and Edge.
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

function getSecretBytes(): ArrayBuffer {
  const s = process.env.ADMIN_JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "ADMIN_JWT_SECRET is missing or too short (>=16 chars required)."
    );
  }
  // Copy into a fresh ArrayBuffer so the Web Crypto type system stays
  // happy regardless of TextEncoder's underlying buffer kind.
  const view = new TextEncoder().encode(s);
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
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

// crypto.subtle.verify performs constant-time HMAC verification. The
// type fences below work around TS's strict ArrayBufferLike pickiness by
// going through fresh ArrayBuffers.
async function verifyHmac(
  signingInput: string,
  signature: Uint8Array
): Promise<boolean> {
  const key = await importHmacKey();
  return crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(signature),
    toArrayBuffer(new TextEncoder().encode(signingInput))
  );
}

async function signHmac(signingInput: string): Promise<Uint8Array> {
  const key = await importHmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(new TextEncoder().encode(signingInput))
  );
  return new Uint8Array(sig);
}

// ---------------------------------------------------------------------------
// signAdminJwt — produce an HS256 JWT.
// ---------------------------------------------------------------------------
export async function signAdminJwt(
  payload: Omit<AdminJwtPayload, "iat" | "exp">,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AdminJwtPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const headerSeg = b64urlEncodeString(JSON.stringify(header));
  const payloadSeg = b64urlEncodeString(JSON.stringify(fullPayload));
  const signingInput = `${headerSeg}.${payloadSeg}`;

  const sig = await signHmac(signingInput);
  const sigSeg = b64urlEncodeBytes(sig);

  return `${signingInput}.${sigSeg}`;
}

// ---------------------------------------------------------------------------
// verifyAdminJwt — returns payload on success, null on any failure.
// Never throws — callers decide what to do on null.
// ---------------------------------------------------------------------------
export async function verifyAdminJwt(
  token: string
): Promise<AdminJwtPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerSeg, payloadSeg, sigSeg] = parts;

    const sig = b64urlDecodeToBytes(sigSeg);
    const ok = await verifyHmac(`${headerSeg}.${payloadSeg}`, sig);
    if (!ok) return null;

    // Parse + validate header.
    const header = JSON.parse(b64urlDecodeToString(headerSeg));
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    // Parse + validate payload.
    const payload = JSON.parse(
      b64urlDecodeToString(payloadSeg)
    ) as AdminJwtPayload;
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;
    if (payload.iat > now + 60) return null; // allow 60s clock skew
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.role !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// getAdminFromRequest — pull the cookie off a Web Request, verify, return.
// Works in route handlers and middleware (NextRequest extends Request).
// ---------------------------------------------------------------------------
export type AdminSession = {
  adminId: string;
  role: AdminRole;
  mfa: boolean;
  email?: string;
  expiresAt: number;
};

export async function getAdminFromRequest(
  req: Request
): Promise<AdminSession | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const token = parseCookie(cookieHeader, ADMIN_COOKIE);
  if (!token) return null;

  const payload = await verifyAdminJwt(token);
  if (!payload) return null;

  return {
    adminId: payload.sub,
    role: payload.role,
    mfa: payload.mfa,
    email: payload.email,
    expiresAt: payload.exp,
  };
}

// Tiny cookie parser — single name lookup, doesn't allocate a full map.
export function parseCookie(header: string, name: string): string | null {
  const target = name + "=";
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    if (p.startsWith(target)) {
      return decodeURIComponent(p.slice(target.length));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cookie-string builder for Set-Cookie. Centralized so login + middleware +
// session route all set/clear with consistent flags.
// ---------------------------------------------------------------------------
export function buildAdminCookie(
  token: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${ttlSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildClearAdminCookie(): string {
  const parts = [
    `${ADMIN_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}
