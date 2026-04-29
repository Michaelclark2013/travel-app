"use client";

// app/admin/login/verify/page.tsx — Track 1 magic-link click target.
//
// WHAT
//   Reads ?token= from the URL, POSTs it to /api/admin/login/verify which
//   sets the cookie. On success, redirects to /admin/mfa-setup or /admin
//   based on the response.
//
// WHY a client page in front of the API call
//   Email clients sometimes prefetch GET URLs (which would burn the token).
//   This page POSTs from inside the user's browser when they actually click
//   the link, sidestepping prefetch.

import { useEffect, useState } from "react";

export default function VerifyPage() {
  const [status, setStatus] = useState<"verifying" | "ok" | "error">("verifying");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) {
      setError("Missing token.");
      setStatus("error");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/admin/login/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setError(data.error ?? `Verification failed (${res.status}).`);
          setStatus("error");
          return;
        }
        setStatus("ok");
        // Hard redirect — we want a fresh request so middleware sees the
        // cookie and gates correctly.
        window.location.replace(data.redirectTo ?? "/admin");
      } catch {
        setError("Network error.");
        setStatus("error");
      }
    })();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0d10",
        color: "#e6e8eb",
        display: "grid",
        placeItems: "center",
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace',
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 12,
          padding: 28,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          VOYAGE ADMIN
        </div>
        <h1 style={{ fontSize: 20, margin: "8px 0 24px", fontWeight: 600 }}>
          {status === "verifying"
            ? "Verifying link…"
            : status === "ok"
              ? "Signed in. Redirecting…"
              : "Sign-in failed"}
        </h1>
        {error && (
          <div
            style={{
              padding: "10px 12px",
              background: "#3a1f25",
              border: "1px solid #6b2d35",
              borderRadius: 6,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div style={{ marginBottom: 12 }}>{error}</div>
            <a href="/admin/login" style={{ color: "#93c5fd" }}>
              Request a new link →
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
