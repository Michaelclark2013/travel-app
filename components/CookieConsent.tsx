"use client";

// components/CookieConsent.tsx — Track 8 enhanced cookie consent.
//
// Adds per-category toggles + server-side registry on top of the lightweight
// CookieBanner. We do NOT delete the original banner; this is a bigger,
// preferences-aware sheet that opens from the small banner's "Customize"
// button (or directly from /legal/cookies).

import Link from "next/link";
import { useEffect, useState } from "react";
import { readStoredConsent, setConsent, type Consent } from "@/lib/consent";

const STORAGE_KEY = "voyage:cookie-consent-v2";

type CookieConsentProps = {
  /** When true, the dialog renders unconditionally (e.g. settings page). */
  forceOpen?: boolean;
  onClose?: () => void;
};

export default function CookieConsent({ forceOpen, onClose }: CookieConsentProps) {
  const [show, setShow] = useState<boolean>(!!forceOpen);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [functional, setFunctional] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = readStoredConsent();
    if (existing) {
      setAnalytics(existing.analytics);
      setMarketing(existing.marketing);
      setFunctional(existing.functional);
    }
    if (forceOpen) {
      setShow(true);
      return;
    }
    if (!window.localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setShow(true), 600);
      return () => clearTimeout(t);
    }
  }, [forceOpen]);

  async function persist(c: Omit<Consent, "consentedAt">) {
    setBusy(true);
    setConsent(c);
    // Best-effort server registry write. If the user is signed-in, the route
    // attaches their auth.uid; otherwise it returns 401 and we just keep the
    // local record.
    try {
      const auth = await readBearer();
      await fetch("/api/me/consent", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        },
        body: JSON.stringify(c),
      });
    } catch {
      /* offline — already persisted locally */
    }
    setBusy(false);
    setShow(false);
    onClose?.();
  }

  if (!show) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none bottom-20 lg:bottom-5 right-4 left-4 sm:left-auto sm:right-5 sm:max-w-md"
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
        <div className="text-sm font-semibold mb-1">Your privacy choices</div>
        <p className="text-xs text-[var(--foreground)]/80 leading-relaxed mb-3">
          Essential cookies keep you signed in. Other categories are optional —
          choose what we may use. You can change this anytime from{" "}
          <Link href="/legal/cookies" className="text-[var(--accent)] hover:underline">
            cookie settings
          </Link>
          .
        </p>

        <ul className="space-y-2 mb-3">
          <Toggle
            label="Functional"
            description="Remember preferences (language, currency, last viewed trip)."
            checked={functional}
            onChange={setFunctional}
          />
          <Toggle
            label="Analytics"
            description="Anonymous usage data to improve the product."
            checked={analytics}
            onChange={setAnalytics}
          />
          <Toggle
            label="Marketing"
            description="Used for retargeting and conversion measurement."
            checked={marketing}
            onChange={setMarketing}
          />
        </ul>

        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => persist({ analytics: false, marketing: false, functional: false })}
            className="btn-ghost text-xs px-3 py-1.5 flex-1"
          >
            Reject all
          </button>
          <button
            disabled={busy}
            onClick={() => persist({ analytics, marketing, functional })}
            className="btn-ghost text-xs px-3 py-1.5 flex-1"
          >
            Save choices
          </button>
          <button
            disabled={busy}
            onClick={() => persist({ analytics: true, marketing: true, functional: true })}
            className="btn-primary text-xs px-3 py-1.5 flex-1"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <li className="flex items-start gap-3">
      <label className="flex items-center gap-2 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
      </label>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[11px] text-[var(--muted)] leading-snug">{description}</div>
      </div>
    </li>
  );
}

// Read the Supabase auth token from the conventional storage key, if it
// exists. Imported lazily to avoid pulling Supabase into the client bundle
// just for the consent dialog.
async function readBearer(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    // Supabase stores its session under sb-<ref>-auth-token. Find first match.
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.access_token === "string") return parsed.access_token;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}
