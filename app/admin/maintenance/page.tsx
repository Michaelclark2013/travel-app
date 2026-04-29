"use client";

// app/admin/maintenance/page.tsx — Track 6 maintenance toggle.
//
// WHAT
//   - Toggle global maintenance (`maintenance.global` flag).
//   - Toggle per-route maintenance (`maintenance.flights`, etc).
//   - Live-preview the 503 HTML the public will see.
//
// WHY a client component
//   Toggling is interactive. Each toggle hits /api/admin/flags which
//   audit-logs and busts the cache.
//
// ENV VARS
//   None directly.

import { useEffect, useState } from "react";

type Flag = {
  key: string;
  enabled: boolean;
  kind: string;
  value: Record<string, unknown>;
};

const KNOWN_ROUTES = [
  "flights",
  "hotels",
  "trips",
  "wallet",
  "explore",
  "plan",
  "messages",
  "notifications",
  "esim",
  "points",
];

export default function MaintenancePage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/flags", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setFlags(data.flags ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function flagFor(key: string): Flag | undefined {
    return flags.find((f) => f.key === key);
  }

  function isOn(key: string): boolean {
    const f = flagFor(key);
    if (!f) return false;
    if (!f.enabled) return false;
    return Boolean((f.value as { on?: boolean })?.on);
  }

  async function toggle(key: string, on: boolean) {
    setError("");
    const res = await fetch("/api/admin/flags", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        kind: "boolean",
        value: { on },
        enabled: true,
        description:
          key === "maintenance.global"
            ? "Global maintenance mode — 503s ALL non-admin requests."
            : `Maintenance mode for /${key.split(".")[1] ?? "?"}.`,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Toggle failed (${res.status})`);
    }
    await load();
  }

  const globalOn = isOn("maintenance.global");

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          MAINTENANCE
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Maintenance mode
        </h1>
        <div style={{ opacity: 0.7, fontSize: 13 }}>
          When on, non-admin requests are served a 503 page.
        </div>
      </header>

      {error && (
        <div style={errorStyle}>{error}</div>
      )}

      {/* GLOBAL */}
      <section
        style={{
          padding: 16,
          background: globalOn ? "#3a1f25" : "#11151a",
          border: globalOn ? "1px solid #6b2d35" : "1px solid #1f2630",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Global maintenance</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Affects all routes except /admin and /status.
            </div>
          </div>
          <button
            onClick={() => toggle("maintenance.global", !globalOn)}
            disabled={loading}
            style={globalOn ? activeButtonStyle : buttonStyle}
          >
            {globalOn ? "Turn OFF" : "Turn ON"}
          </button>
        </div>
        {globalOn && (
          <div style={{ fontSize: 12, color: "#fca5a5" }}>
            ⚠ The site is currently serving 503 to all non-admin traffic.
          </div>
        )}
      </section>

      {/* PER-ROUTE */}
      <section style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            opacity: 0.6,
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          PER-ROUTE
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 8,
          }}
        >
          {KNOWN_ROUTES.map((route) => {
            const key = `maintenance.${route}`;
            const on = isOn(key);
            return (
              <div
                key={route}
                style={{
                  padding: 12,
                  background: on ? "#2a1a20" : "#11151a",
                  border: `1px solid ${on ? "#6b2d35" : "#1f2630"}`,
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <code style={{ color: "#93c5fd", fontSize: 12 }}>/{route}</code>
                  <button
                    onClick={() => toggle(key, !on)}
                    style={{
                      ...buttonStyle,
                      padding: "2px 10px",
                      fontSize: 11,
                      borderColor: on ? "#6b2d35" : "#2a3340",
                    }}
                  >
                    {on ? "off" : "on"}
                  </button>
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{key}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* PREVIEW */}
      <section>
        <button onClick={() => setShowPreview((v) => !v)} style={buttonStyle}>
          {showPreview ? "Hide" : "Show"} 503 preview
        </button>
        {showPreview && (
          <div
            style={{
              marginTop: 12,
              border: "1px solid #1f2630",
              borderRadius: 8,
              overflow: "hidden",
              background: "#000",
            }}
          >
            <iframe
              src="data:text/html;base64,PCFkb2N0eXBlIGh0bWw+PGh0bWwgbGFuZz0iZW4iPjxoZWFkPjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij48bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEiPjx0aXRsZT5Wb3lhZ2UgLSBNYWludGVuYW5jZTwvdGl0bGU+PHN0eWxlPmJvZHkge21hcmdpbjowO21pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2JhY2tncm91bmQ6IzBiMGQxMDtjb2xvcjojZTZlOGViO2ZvbnQtZmFtaWx5OnN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLHNhbnMtc2VyaWY7fS5jYXJke21heC13aWR0aDo0ODBweDtwYWRkaW5nOjMycHg7dGV4dC1hbGlnbjpjZW50ZXJ9aDF7Zm9udC1zaXplOjIycHg7bWFyZ2luOjAgMCAxMnB4O2ZvbnQtd2VpZ2h0OjYwMH1we29wYWNpdHk6MC44O2xpbmUtaGVpZ2h0OjEuNjttYXJnaW46MCAwIDE2cHh9YXtjb2xvcjojOTNjNWZkO3RleHQtZGVjb3JhdGlvbjpub25lfTwvc3R5bGU+PC9oZWFkPjxib2R5PjxkaXYgY2xhc3M9ImNhcmQiPjxoMT5XZSdsbCBiZSByaWdodCBiYWNrPC9oMT48cD5Wb3lhZ2UgaXMgdW5kZXJnb2luZyBzY2hlZHVsZWQgbWFpbnRlbmFuY2UuIFdlIGV4cGVjdCB0byBiZSBiYWNrIG9ubGluZSBzaG9ydGx5LjwvcD48cD5Gb2xsb3cgdXBkYXRlcyBvbiBvdXIgPGEgaHJlZj0iL3N0YXR1cyI+c3RhdHVzIHBhZ2U8L2E+LjwvcD48L2Rpdj48L2JvZHk+PC9odG1sPg=="
              style={{ width: "100%", height: 360, border: 0 }}
              title="503 preview"
            />
          </div>
        )}
      </section>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  background: "#1f2630",
  border: "1px solid #2a3340",
  color: "#e6e8eb",
  padding: "6px 14px",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 12,
  cursor: "pointer",
};

const activeButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#6b2d35",
  borderColor: "#fca5a5",
  color: "#fca5a5",
};

const errorStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#3a1f25",
  border: "1px solid #6b2d35",
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 12,
};
