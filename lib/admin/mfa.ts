// lib/admin/mfa.ts — Track 1 TOTP (RFC 6238) + AES-256-GCM secret storage.
//
// WHAT
//   - generateSecret(): random base32 secret (custom encoder, no library).
//   - otpauthUrl(label, secret): canonical otpauth:// URL for QR rendering.
//   - verifyTotp(secret, code, window=1): time-window TOTP verification.
//   - encryptSecret(plaintext) / decryptSecret(ciphertext): AES-256-GCM
//     wrappers, stored in admin_roles.mfa_secret_encrypted as bytea.
//
// WHY no library
//   The brief says no new npm deps. RFC 6238 and base32 are simple. Doing
//   them by hand keeps the dependency graph slim and the algorithm auditable.
//
// CRYPTO
//   Key derivation: HKDF-style — we take SHA-256(ADMIN_JWT_SECRET || "mfa")
//   to get a 32-byte AES key. Each encrypt uses a random 12-byte IV; the
//   stored blob is iv (12 bytes) || authTag (16 bytes) || ciphertext.
//
// ENV VARS
//   ADMIN_JWT_SECRET — used as the seed for the AES key.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Base32 (RFC 4648, no padding) — custom encoder/decoder.
// ---------------------------------------------------------------------------
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = B32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error("Invalid base32 character");
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---------------------------------------------------------------------------
// Secret generation — 20 random bytes -> 32-char base32 (typical TOTP).
// ---------------------------------------------------------------------------
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

// ---------------------------------------------------------------------------
// otpauthUrl — canonical Google-Authenticator-compatible URL.
// ---------------------------------------------------------------------------
export function otpauthUrl(label: string, secret: string): string {
  const issuer = "Voyage";
  const labelEnc = encodeURIComponent(`${issuer}:${label}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${labelEnc}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// HOTP — RFC 4226. Used internally by verifyTotp.
// ---------------------------------------------------------------------------
function hotp(secret: Buffer, counter: bigint): string {
  const counterBuf = Buffer.alloc(8);
  // Big-endian 64-bit counter.
  counterBuf.writeBigUInt64BE(counter);
  const mac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

// ---------------------------------------------------------------------------
// verifyTotp — accepts code if it matches any window in [-window, +window].
// ---------------------------------------------------------------------------
export function verifyTotp(
  secret: string,
  code: string,
  window: number = 1
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return false;
  }
  const period = 30;
  const now = Math.floor(Date.now() / 1000);
  const counter = BigInt(Math.floor(now / period));
  const codeBuf = Buffer.from(code, "utf8");
  for (let w = -window; w <= window; w++) {
    const c = counter + BigInt(w);
    const candidate = hotp(key, c);
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === codeBuf.length &&
      timingSafeEqual(candidateBuf, codeBuf)
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// AES-256-GCM secret storage.
// ---------------------------------------------------------------------------
function deriveAesKey(): Buffer {
  const seed = process.env.ADMIN_JWT_SECRET;
  if (!seed || seed.length < 16) {
    throw new Error(
      "ADMIN_JWT_SECRET is missing or too short for MFA encryption."
    );
  }
  // Domain-separated key derivation so a leak of the AES key here doesn't
  // give an attacker the JWT signing key (and vice versa, were either ever
  // exposed in isolation).
  return createHash("sha256").update(seed).update("|mfa-aes-v1").digest();
}

export function encryptSecret(plaintext: string): Buffer {
  const key = deriveAesKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // [iv(12) | tag(16) | ciphertext]
  return Buffer.concat([iv, tag, ct]);
}

export function decryptSecret(blob: Buffer): string {
  if (blob.length < 12 + 16 + 1) {
    throw new Error("Encrypted MFA blob is too short");
  }
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const key = deriveAesKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
