"use client";

// components/ImpersonationBanner.tsx — Track 2 user-facing banner.
//
// WHAT
//   Polls /api/admin/users/impersonate/me on mount; if the response says
//   active=true, renders a sticky top banner: "Voyage support is helping
//   you · End session". Clicking End calls the end endpoint and reloads.
//
// WHY a separate component (not inside AuthProvider)
//   AuthProvider is already busy bootstrapping Supabase. Keeping the
//   banner in its own client component lets us drop it into RootLayout
//   without entangling auth state, and lets us iterate on the banner copy
//   without touching auth.
//
// ENV VARS
//   None.

import { useEffect, useState } from "react";

type Status =
  | { active: false }
  | {
      active: true;
      target_user_id: string;
      email: string | null;
      admin_id: string;
      expires_at: number;
    };

export function ImpersonationBanner() {
  const [status, setStatus] = useState<Status>({ active: false });
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/admin/users/impersonate/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled) return;
        setStatus(d);
      } catch {
        /* ignore */
      }
    }
    void poll();
    const t = setInterval(poll, 30_000);
    const s = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(s);
    };
  }, []);

  if (!status.active) return null;

  const remaining = Math.max(0, status.expires_at - now);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  async function end() {
    try {
      await fetch("/api/admin/users/impersonate/end", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.replace("/admin/users");
    }
  }

  return (
    <div
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        background: "#fde68a",
        color: "#1f2937",
        borderBottom: "1px solid #d97706",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace',
      }}
    >
      <strong>Voyage support is helping you</strong>
      <span style={{ opacity: 0.8 }}>
        · viewing as {status.email ?? status.target_user_id} · {mm}:{ss} left
      </span>
      <span style={{ flex: 1 }} />
      <button
        onClick={end}
        style={{
          background: "#1f2937",
          color: "#fde68a",
          border: "none",
          padding: "6px 12px",
          borderRadius: 4,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        End session
      </button>
    </div>
  );
}
