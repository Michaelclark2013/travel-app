"use client";

// app/admin/mfa-setup/page.tsx — Track 1 TOTP enrollment.
//
// WHAT
//   GETs /api/admin/mfa/setup to fetch a fresh secret + otpauth URL,
//   renders a QR (via the existing qrcode-generator dep) inline as SVG,
//   shows the base32 secret as a copy-paste fallback, then takes a 6-digit
//   code and POSTs it back to enroll.
//
// ENV VARS
//   None directly — endpoint reads ADMIN_JWT_SECRET.

import { useEffect, useState } from "react";
import { qrCodeSvg } from "@/lib/qr";

export default function MfaSetupPage() {
  const [secret, setSecret] = useState<string>("");
  const [otpUrl, setOtpUrl] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [status, setStatus] = useState<
    "loading" | "ready" | "verifying" | "ok" | "error"
  >("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/mfa/setup", {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Failed to start enrollment.");
          setStatus("error");
          return;
        }
        setSecret(data.secret);
        setOtpUrl(data.otpauthUrl);
        setStatus("ready");
      } catch {
        setError("Network error.");
        setStatus("error");
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setError("");
    try {
      const res = await fetch("/api/admin/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secret, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Verification failed.");
        setStatus("ready"); // back to ready so user can retry
        return;
      }
      setStatus("ok");
      window.location.replace(data.redirectTo ?? "/admin");
    } catch {
      setError("Network error.");
      setStatus("ready");
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
          maxWidth: 480,
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 12,
          padding: 28,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          VOYAGE ADMIN
        </div>
        <h1 style={{ fontSize: 22, margin: "8px 0 8px", fontWeight: 600 }}>
          Enroll in MFA
        </h1>
        <p style={{ opacity: 0.7, fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
          Scan the QR with an authenticator app (1Password, Authy, Google
          Authenticator). Then enter the 6-digit code to finish.
        </p>

        {status === "loading" && <div>Generating secret…</div>}

        {(status === "ready" || status === "verifying") && (
          <>
            <div
              style={{
                background: "white",
                padding: 16,
                borderRadius: 8,
                width: 256,
                height: 256,
                margin: "0 auto",
              }}
              dangerouslySetInnerHTML={{
                __html: qrCodeSvg(otpUrl, { size: 224, fg: "#0b0d10" }),
              }}
            />
            <details
              style={{
                marginTop: 16,
                background: "#0b0d10",
                border: "1px solid #1f2630",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 12,
              }}
            >
              <summary style={{ cursor: "pointer", opacity: 0.7 }}>
                Can't scan? Copy this secret
              </summary>
              <code
                style={{
                  display: "block",
                  marginTop: 8,
                  wordBreak: "break-all",
                  fontSize: 13,
                }}
              >
                {secret}
              </code>
            </details>

            <form onSubmit={onSubmit} style={{ marginTop: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  opacity: 0.7,
                  marginBottom: 6,
                }}
                htmlFor="code"
              >
                6-DIGIT CODE
              </label>
              <input
                id="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                style={{
                  width: "100%",
                  background: "#0b0d10",
                  border: "1px solid #2a3340",
                  color: "#e6e8eb",
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: 18,
                  letterSpacing: 4,
                  textAlign: "center",
                }}
                placeholder="000000"
                disabled={status === "verifying"}
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
                disabled={status === "verifying" || code.length !== 6}
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
                  opacity:
                    status === "verifying" || code.length !== 6 ? 0.6 : 1,
                }}
              >
                {status === "verifying" ? "Verifying…" : "Verify and continue"}
              </button>
            </form>
          </>
        )}

        {status === "error" && (
          <div
            style={{
              padding: "10px 12px",
              background: "#3a1f25",
              border: "1px solid #6b2d35",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
