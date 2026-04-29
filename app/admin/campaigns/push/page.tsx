"use client";

// app/admin/campaigns/push/page.tsx — Track 7 push composer.
//
// Composer for Web Push notifications: title, body, deeplink, segment.
// Schedule for later or send-now via the admin send endpoint.

import { useEffect, useState } from "react";
import { SegmentPicker } from "../_components/SegmentPicker";
import type { Segment } from "@/lib/admin/support";

type Campaign = {
  id: string;
  kind: string;
  name: string;
  status: string;
  target: Segment;
  body: { title?: string; body?: string; deeplink?: string };
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  created_at: string;
};

export default function PushCampaignsPage() {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deeplink, setDeeplink] = useState("");
  const [segment, setSegment] = useState<Segment>({ kind: "all" });
  const [scheduledAt, setScheduledAt] = useState("");
  const [rows, setRows] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const res = await fetch("/api/admin/campaigns?kind=push", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setRows(data.rows ?? []);
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function create(opts: { sendNow: boolean }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "push",
          name: name || title || "Untitled push",
          target: segment,
          body: { title, body, deeplink: deeplink || undefined },
          scheduled_at: opts.sendNow ? null : scheduledAt || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      if (opts.sendNow && data.id) {
        const sendRes = await fetch(`/api/admin/campaigns/${data.id}/send`, {
          method: "POST",
          credentials: "include",
        });
        const sendData = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) {
          setError(sendData.error ?? `Send failed (${sendRes.status})`);
        }
      }
      setName("");
      setTitle("");
      setBody("");
      setDeeplink("");
      setScheduledAt("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>CAMPAIGNS / PUSH</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Push notification composer
        </h1>
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
        <Row label="Campaign name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="internal name"
            style={{ ...input, width: "100%" }}
          />
        </Row>
        <Row label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            style={{ ...input, width: "100%" }}
            placeholder="Shown in the OS notification"
          />
        </Row>
        <Row label="Body">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={240}
            rows={3}
            style={{ ...input, width: "100%", resize: "vertical" }}
          />
        </Row>
        <Row label="Deeplink">
          <input
            value={deeplink}
            onChange={(e) => setDeeplink(e.target.value)}
            placeholder="/trips/abc — relative path opens in the app"
            style={{ ...input, width: "100%" }}
          />
        </Row>
        <Row label="Segment">
          <SegmentPicker value={segment} onChange={setSegment} />
        </Row>
        <Row label="Schedule (optional)">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            style={input}
          />
        </Row>

        {/* Live preview */}
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "#0e1217",
            border: "1px solid #2a3340",
            borderRadius: 8,
            display: "flex",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "#1d4ed8",
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{title || "Title"}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{body || "Body text"}</div>
            {deeplink && (
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                voyage.app{deeplink}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => void create({ sendNow: true })}
            disabled={busy || !title}
            style={{ ...buttonStyle, background: "#1d4ed8", borderColor: "#1d4ed8" }}
          >
            Send now
          </button>
          <button
            onClick={() => void create({ sendNow: false })}
            disabled={busy || !title}
            style={buttonStyle}
          >
            {scheduledAt ? "Schedule" : "Save draft"}
          </button>
          {error && <span style={{ color: "#fca5a5", fontSize: 12 }}>{error}</span>}
        </div>
      </section>

      <CampaignList rows={rows} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 8 }}>
      <label style={{ width: 140, fontSize: 12, opacity: 0.7, paddingTop: 6 }}>
        {label}
      </label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function CampaignList({ rows }: { rows: Campaign[] }) {
  return (
    <section
      style={{
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 8,
      }}
    >
      <div style={{ padding: "10px 12px", fontSize: 12, opacity: 0.7 }}>Recent push campaigns</div>
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
          <span style={{ width: 100, opacity: 0.6 }}>
            {r.sent_count} sent
          </span>
          <span style={{ width: 160, opacity: 0.6 }}>
            {r.sent_at ? new Date(r.sent_at).toLocaleString() : r.scheduled_at ? `→ ${new Date(r.scheduled_at).toLocaleString()}` : "draft"}
          </span>
        </div>
      ))}
      {rows.length === 0 && (
        <div style={{ padding: 24, opacity: 0.5, fontSize: 13, textAlign: "center" }}>
          No push campaigns yet.
        </div>
      )}
    </section>
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
