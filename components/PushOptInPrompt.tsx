// Web Push opt-in card. Renders nothing unless:
//   - the browser supports Push + Notifications,
//   - NEXT_PUBLIC_VAPID_PUBLIC_KEY is set (otherwise we'd just fail silently),
//   - the user hasn't already granted/denied permission,
//   - and they haven't dismissed this prompt before.
// The actual subscribe/permission dance lives in lib/push.ts.

"use client";

import { useEffect, useState } from "react";
import {
  PUSH_OPT_IN_KEY,
  currentPermission,
  isPushConfigured,
  isPushSupported,
  subscribeToPush,
} from "@/lib/push";

export default function PushOptInPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPushSupported()) return;
    if (!isPushConfigured()) return;
    if (currentPermission() !== "default") return;
    if (window.localStorage.getItem(PUSH_OPT_IN_KEY)) return;
    // Wait a couple seconds before showing — looks less spammy.
    const t = window.setTimeout(() => setShow(true), 6000);
    return () => window.clearTimeout(t);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PUSH_OPT_IN_KEY, "1");
    }
    setShow(false);
  }

  async function enable() {
    setBusy(true);
    try {
      const res = await subscribeToPush();
      if (res.ok) dismiss();
      else if (res.reason === "denied") dismiss();
      else setShow(false);
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-x-4 sm:left-5 sm:right-auto bottom-20 lg:bottom-5 z-40 sm:max-w-xs pointer-events-none"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="pointer-events-auto rounded-xl p-4 backdrop-blur-xl shadow-2xl border"
        style={{
          background: "var(--background-soft)",
          borderColor: "var(--border-strong)",
        }}
        role="dialog"
        aria-label="Enable trip alerts"
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            🔔
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Trip alerts</div>
            <div className="text-xs text-[var(--muted)] mt-1">
              Flight delays, gate changes, and price drops — only the stuff
              that matters.
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-[var(--muted)] hover:text-white text-lg leading-none -mt-1"
          >
            ×
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={dismiss}
            className="btn-ghost text-xs px-3 py-1.5 flex-1"
          >
            Not now
          </button>
          <button
            onClick={enable}
            disabled={busy}
            className="btn-primary text-xs px-3 py-1.5 flex-1 disabled:opacity-60"
          >
            {busy ? "Enabling…" : "Enable"}
          </button>
        </div>
      </div>
    </div>
  );
}
