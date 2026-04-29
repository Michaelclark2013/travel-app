"use client";

// app/admin/campaigns/banner/page.tsx — Track 7 in-app banner composer.
//
// Sets `flags.banner.<id>` via Track 6's flag system. Track 6 isn't
// merged yet — until then we ship the admin UI but stub the flag write
// (the campaign row is still authoritative; once Track 6 lands its
// banner-rendering hook can read from outbound_campaigns directly OR
// from the flag, and either path works).

import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  kind: string;
  name: string;
  status: string;
  body: { id?: string; html?: string; severity?: string };
  sent_count: number;
};

const SEVERITIES = ["info", "warning", "critical"] as const;

export default function BannerCampaignsPage() {
  const [bannerId, setBannerId] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("info");
  const [rows, setRows] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const res = await fetch("/api/admin/campaigns?kind=banner", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setRows(data.rows ?? []);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function publish() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "banner",
          name: name || `Banner ${bannerId || "default"}`,
          target: { kind: "all" },
          body: { id: bannerId || "default", html: text, severity },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      if (data.id) {
        await fetch(`/api/admin/campaigns/${data.id}/send`, {
          method: "POST",
          credentials: "include",
        });
      }
      setText("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function takeDown(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/admin/campaigns/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>CAMPAIGNS / BANNER</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          In-app banner composer
        </h1>
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          Publishes a banner record + (when Track 6 ships) flips
          <code> flags.banner.&lt;id&gt;</code>. Until then the banner is queued; the
          rendering layer reads <code>outbound_campaigns</code> directly.
        </p>
      </header>

      <section
        style={{
          padding: 12,
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 8 }}>
          <input
            value={bannerId}
            onChange={(e) => setBannerId(e.target.value.replace(/[^a-z0-9-]/gi, "-").toLowerCase())}
            placeholder="banner id (slug)"
            style={input}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="display name"
            style={input}
          />
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number])}
            style={input}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Banner text (plain or minimal HTML)."
          style={{ ...input, width: "100%", resize: "vertical" }}
        />

        <div
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 6,
            background:
              severity === "critical"
                ? "#3a1f25"
                : severity === "warning"
                  ? "#3a2e1f"
                  : "#1f2a3a",
            border: "1px solid #2a3340",
            fontSize: 13,
          }}
        >
          {text || "Banner preview"}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => void publish()}
            disabled={busy || !text}
            style={{ ...buttonStyle, background: "#1d4ed8", borderColor: "#1d4ed8" }}
          >
            Publish banner
          </button>
          {error && <span style={{ color: "#fca5a5", fontSize: 12 }}>{error}</span>}
        </div>
      </section>

      <section
        style={{
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
        }}
      >
        <div style={{ padding: "10px 12px", fontSize: 12, opacity: 0.7 }}>Live + recent banners</div>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              padding: "8px 12px",
              borderTop: "1px solid #1f2630",
              display: "flex",
              gap: 12,
              fontSize: 12,
            }}
          >
            <span style={{ width: 80, opacity: 0.7 }}>{r.status}</span>
            <span style={{ flex: 1 }}>{r.name}</span>
            <span style={{ width: 90, opacity: 0.6 }}>{r.body.severity ?? "info"}</span>
            <button
              onClick={() => void takeDown(r.id)}
              disabled={busy || r.status === "cancelled"}
              style={{ ...buttonStyle, color: "#fca5a5" }}
            >
              Take down
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: 24, opacity: 0.5, fontSize: 13, textAlign: "center" }}>
            No banner campaigns yet.
          </div>
        )}
      </section>
    </div>
  );
}

const input: React.CSSProperties = {
  background: "#0b0d10",
  border: "1px solid #2a3340",
  color: "#e6e8eb",
  padding: "6px 8px",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 12,
};
const buttonStyle: React.CSSProperties = {
  background: "#1f2630",
  border: "1px solid #2a3340",
  color: "#e6e8eb",
  padding: "6px 12px",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 12,
  cursor: "pointer",
};
