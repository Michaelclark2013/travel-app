"use client";

// app/admin/login/page.tsx — Track 1 admin sign-in (request a magic link).
//
// WHAT
//   Single email field. POST -> /api/admin/login. Always shows the same
//   "if eligible, check your inbox" confirmation regardless of whether the
//   email was actually accepted (anti-enumeration).
//
// ENV VARS
//   None (the API endpoint reads RESEND_API_KEY etc.)

import { useState } from "react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "sent" | "error"
  >("idle");
  const [error, setError] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Network error.");
      setStatus("error");
    }
  }

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
        <h1 style={{ fontSize: 22, margin: "8px 0 24px", fontWeight: 600 }}>
          Sign in
        </h1>

        {status === "sent" ? (
          <div style={{ lineHeight: 1.6 }}>
            <p>
              If <strong>{email}</strong> is an authorized admin, a sign-in
              link has been sent. The link expires in 15 minutes.
            </p>
            <p style={{ marginTop: 16, opacity: 0.7, fontSize: 13 }}>
              Check the inbox associated with that address. If you don't see
              it, check spam — or run the dev server and watch the console
              for the verify URL when RESEND_API_KEY isn't set.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 6,
              }}
              htmlFor="email"
            >
              EMAIL
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "submitting"}
              style={{
                width: "100%",
                background: "#0b0d10",
                border: "1px solid #2a3340",
                color: "#e6e8eb",
                padding: "10px 12px",
                borderRadius: 8,
                fontFamily: "inherit",
                fontSize: 14,
              }}
              placeholder="you@voyage.app"
            />
            {error && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  background: "#3a1f25",
                  border: "1px solid #6b2d35",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={status === "submitting" || !email}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "10px 12px",
                background: "#3b82f6",
                border: "none",
                color: "white",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 14,
                opacity: status === "submitting" || !email ? 0.6 : 1,
              }}
            >
              {status === "submitting" ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
