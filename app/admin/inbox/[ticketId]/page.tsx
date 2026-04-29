"use client";

// app/admin/inbox/[ticketId]/page.tsx — Track 7 threaded ticket view.
//
// WHAT
//   - Header: subject, status pill, priority pill, SLA timer (red when
//     overdue), buttons to change status / priority / assignee.
//   - Body: chronological message list. Customer messages left,
//     admin replies right, internal notes yellow, system messages
//     centered + dim.
//   - Footer: reply box with canned-replies dropdown, "Draft with Claude"
//     button, "Send" + "Save as note".

import { useEffect, useMemo, useRef, useState } from "react";
import { use } from "react";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/admin/support";

type Ticket = {
  id: string;
  user_id: string | null;
  email: string | null;
  subject: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: number;
  ticket_id: string;
  from_kind: "user" | "admin" | "system" | "note";
  from_id: string | null;
  body: string;
  created_at: string;
};

type Macro = { id: string; name: string; body: string };

export default function TicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = use(params);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [reply, setReply] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, force] = useState(0);
  const tickRef = useRef<number | null>(null);

  // Re-render every 30s so the SLA timer is live.
  useEffect(() => {
    tickRef.current = window.setInterval(() => force((n) => n + 1), 30_000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [t, m] = await Promise.all([
        fetch(`/api/admin/support/tickets/${ticketId}`, { credentials: "include" }).then(
          (r) => r.json()
        ),
        fetch(`/api/admin/support/macros`, { credentials: "include" }).then((r) => r.json()),
      ]);
      if (!t.ok) {
        setError(t.error ?? "Failed to load.");
      } else {
        setTicket(t.ticket);
        setMessages(t.messages);
      }
      if (m.ok) setMacros(m.rows);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function postReply(asNote: boolean) {
    if (!reply.trim()) return;
    setBusy(true);
    setError("");
    try {
      const url = asNote
        ? `/api/admin/support/tickets/${ticketId}/note`
        : `/api/admin/support/tickets/${ticketId}/reply`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setReply("");
      setDrafts([]);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patchTicket(update: Partial<Ticket>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? `Failed (${res.status})`);
      else await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function draftWithClaude() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/support/draft`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setDrafts(data.drafts ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const sla = useMemo(() => {
    if (!ticket?.sla_due_at) return null;
    const due = new Date(ticket.sla_due_at).getTime();
    const ms = due - Date.now();
    const overdue = ms < 0;
    return { overdue, ms };
  }, [ticket?.sla_due_at]);

  if (loading && !ticket) {
    return <div style={{ opacity: 0.6 }}>Loading…</div>;
  }
  if (!ticket) {
    return <div style={errorStyle}>{error || "Ticket not found."}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 900 }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 12,
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, opacity: 0.6 }}>{ticket.id}</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {ticket.subject ?? "(no subject)"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
            {ticket.email ?? "no email"} {ticket.user_id ? `· user ${ticket.user_id.slice(0, 8)}` : ""}
          </div>
        </div>
        <select
          value={ticket.status}
          onChange={(e) => void patchTicket({ status: e.target.value as TicketStatus })}
          disabled={busy}
          style={inputStyle}
        >
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={ticket.priority}
          onChange={(e) => void patchTicket({ priority: e.target.value as TicketPriority })}
          disabled={busy}
          style={inputStyle}
        >
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {sla && (
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              background: sla.overdue ? "#3a1f25" : "#1f2630",
              border: `1px solid ${sla.overdue ? "#6b2d35" : "#2a3340"}`,
              color: sla.overdue ? "#fca5a5" : "#e6e8eb",
              fontSize: 12,
              minWidth: 90,
              textAlign: "center",
            }}
            title={`SLA due ${ticket.sla_due_at}`}
          >
            {sla.overdue ? "OVERDUE " : "SLA "}
            {formatDelta(sla.ms)}
          </div>
        )}
      </header>

      {/* Thread */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 12,
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
          minHeight: 300,
        }}
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}
        {messages.length === 0 && (
          <div style={{ opacity: 0.5, fontSize: 13 }}>No messages yet.</div>
        )}
      </section>

      {/* Reply */}
      <section
        style={{
          padding: 12,
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
        }}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <select
            value=""
            onChange={(e) => {
              const m = macros.find((x) => x.id === e.target.value);
              if (m) setReply(reply ? `${reply}\n\n${m.body}` : m.body);
            }}
            style={inputStyle}
            disabled={busy || macros.length === 0}
          >
            <option value="">Insert macro…</option>
            {macros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void draftWithClaude()}
            disabled={busy}
            style={buttonStyle}
            title="POST /api/admin/support/draft"
          >
            Draft with Claude
          </button>
        </div>

        {drafts.length > 0 && (
          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
            {drafts.map((d, i) => (
              <button
                key={i}
                onClick={() => setReply(d)}
                style={{
                  ...buttonStyle,
                  textAlign: "left",
                  whiteSpace: "pre-wrap",
                  background: "#0e1217",
                  padding: 10,
                  fontSize: 12,
                }}
              >
                Draft {i + 1}: {d}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={6}
          placeholder="Type your reply… (markdown OK; sent as plain text)"
          style={{
            ...inputStyle,
            width: "100%",
            minHeight: 120,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={() => void postReply(false)}
            disabled={busy || !reply.trim()}
            style={{ ...buttonStyle, background: "#1d4ed8", borderColor: "#1d4ed8" }}
          >
            Send reply
          </button>
          <button
            onClick={() => void postReply(true)}
            disabled={busy || !reply.trim()}
            style={{
              ...buttonStyle,
              background: "#fef3c7",
              color: "#1f2630",
              borderColor: "#fde68a",
            }}
          >
            Save as note
          </button>
          <div style={{ flex: 1 }} />
          {error && <span style={{ color: "#fca5a5", fontSize: 12 }}>{error}</span>}
        </div>
      </section>
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const isAdmin = m.from_kind === "admin";
  const isUser = m.from_kind === "user";
  const isNote = m.from_kind === "note";
  const isSystem = m.from_kind === "system";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isAdmin ? "flex-end" : isSystem ? "center" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "70%",
          padding: "8px 12px",
          borderRadius: 8,
          background: isAdmin
            ? "#1d4ed8"
            : isNote
              ? "#fef3c7"
              : isSystem
                ? "transparent"
                : "#1f2630",
          color: isNote ? "#1f2630" : "#e6e8eb",
          fontSize: 13,
          opacity: isSystem ? 0.6 : 1,
          border: isSystem ? "1px dashed #2a3340" : "none",
          whiteSpace: "pre-wrap",
        }}
      >
        <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>
          {m.from_kind} · {new Date(m.created_at).toLocaleString()}
        </div>
        {m.body}
      </div>
    </div>
  );
}

function formatDelta(ms: number): string {
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

const inputStyle: React.CSSProperties = {
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

const errorStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#3a1f25",
  border: "1px solid #6b2d35",
  borderRadius: 6,
  fontSize: 13,
};
