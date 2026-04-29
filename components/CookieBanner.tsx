"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "voyage:cookie-consent";

type Consent = "all" | "essential";

export default function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(KEY)) {
      // Defer slightly so the banner doesn't flash before paint.
      const t = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function decide(c: Consent) {
    try {
      window.localStorage.setItem(KEY, c);
    } catch {}
    // Tell analytics & error reporters whether to opt in. They listen for this event.
    window.dispatchEvent(
      new CustomEvent("voyage:cookie-consent", { detail: c })
    );
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none bottom-20 lg:bottom-5 right-4 left-4 sm:left-auto sm:right-5 sm:max-w-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        role="dialog"
        aria-label="Cookie preferences"
        className="pointer-events-auto rounded-xl p-4 backdrop-blur-xl shadow-2xl border"
        style={{
          background: "var(--background-soft)",
          borderColor: "var(--border-strong)",
        }}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 text-xs text-[var(--foreground)]/90 leading-relaxed">
            Cookies keep you signed in. Optional analytics help us improve.{" "}
            <Link
              href="/legal/cookies"
              className="text-[var(--accent)] hover:underline"
            >
              Learn more
            </Link>
          </div>
          <button
            onClick={() => decide("essential")}
            aria-label="Dismiss"
            className="text-[var(--muted)] hover:text-white text-lg leading-none -mt-1"
          >
            ×
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => decide("essential")}
            className="btn-ghost text-xs px-3 py-1.5 flex-1"
          >
            Essential only
          </button>
          <button
            onClick={() => decide("all")}
            className="btn-primary text-xs px-3 py-1.5 flex-1"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
