"use client";

// app/admin/campaigns/email/page.tsx — Track 7 email campaign composer.
//
// WHAT
//   Markdown editor (left) + live HTML preview (right). The preview is
//   rendered server-side via /api/admin/support/preview so the HTML the
//   admin sees is byte-identical to what gets sent.

import { useEffect, useRef, useState } from "react";
import { SegmentPicker } from "../_components/SegmentPicker";
import type { Segment } from "@/lib/admin/support";

type Campaign = {
  id: string;
  kind: string;
  name: string;
  status: string;
  body: { subject?: string; markdown?: string; html?: string };
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
};

const PLACEHOLDER = `# Big news from Voyage

We just shipped **price-watch alerts** for every saved trip.

- Track flight + hotel prices in one tap
- Get notified when a fare drops 10% or more
- Roll your savings into Pro for free trips

[Open the app](https://voyage.app/trips)
`;

export default function EmailCampaignsPage() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [markdown, setMarkdown] = useState(PLACEHOLDER);
  const [html, setHtml] = useState("");
  const [segment, setSegment] = useState<Segment>({ kind: "all" });
  const [scheduledAt, setScheduledAt] = useState("");
  const [rows, setRows] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previewTimer = useRef<number | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/campaigns?kind=email", {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setRows(data.rows ?? []);
  }
  useEffect(() => {
    void refresh();
  }, []);

  // Debounced server-rendered preview.
  useEffect(() => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/support/preview", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markdown }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setHtml(data.html ?? "");
      } catch {
        /* ignore */
      }
    }, 250);
    return () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
    };
  }, [markdown]);

  async function create(opts: { sendNow: boolean }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "email",
          name: name || subject || "Untitled email",
          target: segment,
          body: { subject, markdown, html },
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
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>CAMPAIGNS / EMAIL</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Email campaign composer
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Internal name"
            style={input}
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            style={input}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <SegmentPicker value={segment} onChange={setSegment} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            minHeight: 360,
          }}
        >
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            style={{
              ...input,
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              minHeight: 360,
              resize: "vertical",
            }}
          />
          <div
            style={{
              padding: 16,
              background: "#fff",
              color: "#111",
              borderRadius: 6,
              minHeight: 360,
              overflow: "auto",
              fontFamily: "system-ui, sans-serif",
              fontSize: 14,
            }}
            // The HTML comes from our own server-side renderMarkdown, which
            // escapes input and only re-emits a tiny subset of safe tags.
            // Links are validated against http(s)/mailto schemes. This is
            // the SAME HTML that goes out via Resend.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            style={input}
          />
          <button
            onClick={() => void create({ sendNow: true })}
            disabled={busy || !subject || !markdown}
            style={{ ...buttonStyle, background: "#1d4ed8", borderColor: "#1d4ed8" }}
          >
            Send now
          </button>
          <button
            onClick={() => void create({ sendNow: false })}
            disabled={busy || !subject || !markdown}
            style={buttonStyle}
          >
            {scheduledAt ? "Schedule" : "Save draft"}
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
        <div style={{ padding: "10px 12px", fontSize: 12, opacity: 0.7 }}>Recent email campaigns</div>
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
            <span style={{ width: 100, opacity: 0.6 }}>{r.sent_count} sent</span>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: 24, opacity: 0.5, fontSize: 13, textAlign: "center" }}>
            No email campaigns yet.
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
