// Web Push helpers for Voyage. Stays standards-only (no library) so we don't
// add a dependency. The server bits — generating VAPID keys, signing JWTs,
// encrypting payloads — are stubbed for now; we just POST the subscription
// JSON to /api/push/subscribe and let the server log it.

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export const PUSH_OPT_IN_KEY = "voyage:push-optin-dismissed";

// Web Push wants the VAPID public key as an ArrayBuffer-backed view
// (base64url decoded). PushManager.subscribe rejects shared/typed arrays
// in TypeScript's lib.dom.d.ts, so we hand back a fresh ArrayBuffer.
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw =
    typeof atob === "function"
      ? atob(safe)
      : Buffer.from(safe, "base64").toString("binary");
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return buffer;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isPushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PUBLIC_KEY.trim().length > 0);
}

export function currentPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function subscribeToPush(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!isPushConfigured()) return { ok: false, reason: "not-configured" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!),
    });
  }

  try {
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch {
    // Network failures shouldn't unsubscribe the user — server can pick up
    // the sub on next attempt.
  }
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;
  return sub.unsubscribe();
}
