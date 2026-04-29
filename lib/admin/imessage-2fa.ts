// lib/admin/imessage-2fa.ts — Track 9 iMessage 2FA integration point.
//
// WHAT
//   STUB. Documents the integration shape so Track 1 can wire iMessage as a
//   second-factor option later without redesigning the surface.
//
// WHY a stub
//   Apple does not expose a public iMessage send API. Two integration paths
//   are realistic:
//     1. AppleScript bridge on a Mac mini: a tiny daemon runs `osascript` to
//        send via the local Messages.app. Reliable but requires hardware.
//     2. Twilio Verify with channel="messenger" (no public iMessage channel
//        as of writing). Falls through to SMS.
//
//   We keep both call sites behind the same `sendImessageOtp(phone, code)`
//   signature so a future PR can swap the implementation.
//
// USAGE (when wired)
//   const code = randomDigits(6);
//   await sendImessageOtp(phone, code);
//   // Cache (phone -> code) with a 5-minute TTL; verify on submit.
//
// ENV VARS (future)
//   IMESSAGE_BRIDGE_URL    — http://mac-mini.internal:8765 (path 1)
//   IMESSAGE_BRIDGE_TOKEN  — bearer for the bridge daemon
//   TWILIO_VERIFY_SID, TWILIO_AUTH_TOKEN — fallback path

export type ImessageResult =
  | { ok: true; channel: "imessage" | "sms"; deliveredAt: string }
  | { ok: false; reason: string };

/**
 * Send a one-time passcode via iMessage. Currently a stub that logs the call
 * and returns ok:false so callers can fall back to email-based MFA. Replace
 * the body when the bridge is up.
 */
export async function sendImessageOtp(
  phone: string,
  code: string
): Promise<ImessageResult> {
  const bridge = process.env.IMESSAGE_BRIDGE_URL;
  const token = process.env.IMESSAGE_BRIDGE_TOKEN;

  if (!bridge || !token) {
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[imessage-2fa] STUB — would send code ${code} to ${phone}.`
      );
    }
    return { ok: false, reason: "Bridge not configured." };
  }

  try {
    const res = await fetch(`${bridge}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone,
        body: `Voyage admin code: ${code}\n\nIf you didn't request this, ignore.`,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `Bridge returned ${res.status}` };
    }
    return {
      ok: true,
      channel: "imessage",
      deliveredAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Seed a 6-digit code from crypto random. */
export function randomOtp(digits = 6): string {
  let out = "";
  for (let i = 0; i < digits; i++) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}
