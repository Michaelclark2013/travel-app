"use client";

// app/admin/inbox/page.tsx — Track 7 support inbox.
//
// WHAT
//   Filterable, virtualized ticket list. Filters: status, priority,
//   assignee (mine / unassigned / any), SLA-breaching toggle, free-text
//   search.
//
// WHY virtualized
//   The brief calls out virtual-scroll explicitly. We don't want to add
//   react-window as a dep; instead we render only the rows whose row-index
//   intersects a computed visible window inside an overflow:auto wrapper.
//   This keeps the DOM cheap even at thousands of tickets.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/admin/support";

type Row = {
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

type Filters = {
  status: string;
  priority: string;
  assigned: string; // "any" | "me" | "none" | uuid
  overdue: boolean;
  q: string;
};

const EMPTY: Filters = {
  status: "",
  priority: "",
  assigned: "any",
  overdue: false,
  q: "",
};

const ROW_H = 44;
const VIEWPORT_H = 600;

export default function InboxPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (!reset && cursor) params.set("cursor", cursor);
    if (filters.status) params.set("status", filters.status);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.assigned && filters.assigned !== "any")
      params.set("assigned", filters.assigned);
    if (filters.overdue) params.set("overdue", "1");
    if (filters.q.trim()) params.set("q", filters.q.trim());
    try {
      const res = await fetch(`/api/admin/support/tickets?${params}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      const newRows: Row[] = data.rows ?? [];
      setRows((cur) => (reset ? newRows : [...cur, ...newRows]));
      setCursor(data.nextCursor ?? null);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleSlice = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 5);
    const end = Math.min(rows.length, start + Math.ceil(VIEWPORT_H / ROW_H) + 10);
    return { start, end };
  }, [scrollTop, rows.length]);

  return (
    <div>
      <header style={{ marginBottom: 16, display: "flex", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>INBOX</div>
          <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
            Support tickets
          </h1>
        </div>
        <div style={{ flex: 1 }} />
        <Link href="/admin/inbox/macros" style={linkStyle}>
          Macros →
        </Link>
        <Link href="/admin/campaigns/push" style={{ ...linkStyle, marginLeft: 12 }}>
          Push →
        </Link>
        <Link href="/admin/campaigns/email" style={{ ...linkStyle, marginLeft: 12 }}>
          Email →
        </Link>
        <Link href="/admin/campaigns/banner" style={{ ...linkStyle, marginLeft: 12 }}>
          Banner →
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRows([]);
          setCursor(null);
          void load(true);
        }}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr)) auto",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          style={inputStyle}
        >
          <option value="">Any status</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.priority}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
          style={inputStyle}
        >
          <option value="">Any priority</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={filters.assigned}
          onChange={(e) => setFilters({ ...filters, assigned: e.target.value })}
          style={inputStyle}
        >
          <option value="any">Any assignee</option>
          <option value="me">Mine</option>
          <option value="none">Unassigned</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", fontSize: 12, gap: 6 }}>
          <input
            type="checkbox"
            checked={filters.overdue}
            onChange={(e) => setFilters({ ...filters, overdue: e.target.checked })}
          />
          SLA breached
        </label>
        <input
          placeholder="search subject/email"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          Apply
        </button>
      </form>

      {error && <div style={errorStyle}>{error}</div>}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrollTop(el.scrollTop);
          // Auto-load next page when within 200px of bottom.
          if (
            cursor &&
            !loading &&
            el.scrollHeight - el.scrollTop - el.clientHeight < 200
          ) {
            void load(false);
          }
        }}
        style={{
          height: VIEWPORT_H,
          overflowY: "auto",
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
        }}
      >
        <div style={{ height: rows.length * ROW_H, position: "relative" }}>
          {rows.slice(visibleSlice.start, visibleSlice.end).map((r, i) => {
            const idx = visibleSlice.start + i;
            const overdue =
              r.sla_due_at &&
              r.status !== "resolved" &&
              r.status !== "spam" &&
              new Date(r.sla_due_at).getTime() < Date.now();
            return (
              <Link
                key={r.id}
                href={`/admin/inbox/${r.id}`}
                style={{
                  position: "absolute",
                  top: idx * ROW_H,
                  left: 0,
                  right: 0,
                  height: ROW_H,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  borderBottom: "1px solid #1f2630",
                  textDecoration: "none",
                  color: "#e6e8eb",
                  fontSize: 12,
                  background: idx % 2 === 0 ? "transparent" : "#0e1217",
                }}
              >
                <span style={{ width: 60, opacity: 0.7 }}>{r.status}</span>
                <span style={{ width: 70, color: priorityColor(r.priority) }}>
                  {r.priority}
                </span>
                <span style={{ flex: 1, opacity: 0.95, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.subject ?? "(no subject)"}
                </span>
                <span style={{ width: 220, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.email ?? "—"}
                </span>
                <span
                  style={{
                    width: 110,
                    fontSize: 11,
                    color: overdue ? "#fca5a5" : "#9ba3ad",
                  }}
                >
                  {r.sla_due_at ? formatRelative(r.sla_due_at) : "—"}
                </span>
              </Link>
            );
          })}
          {rows.length === 0 && !loading && (
            <div style={{ padding: 24, opacity: 0.5, textAlign: "center", fontSize: 13 }}>
              No tickets match these filters.
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
        {rows.length} loaded {cursor ? "— scroll for more" : ""} {loading ? "…" : ""}
      </div>
    </div>
  );
}

function priorityColor(p: TicketPriority): string {
  return p === "urgent"
    ? "#fca5a5"
    : p === "high"
      ? "#fdba74"
      : p === "low"
        ? "#86efac"
        : "#9ba3ad";
}

function formatRelative(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  if (min < 60) return ms >= 0 ? `${min}m left` : `${min}m over`;
  const hr = Math.round(min / 60);
  if (hr < 48) return ms >= 0 ? `${hr}h left` : `${hr}h over`;
  const d = Math.round(hr / 24);
  return ms >= 0 ? `${d}d left` : `${d}d over`;
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

const linkStyle: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 12,
  textDecoration: "none",
};

const errorStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#3a1f25",
  border: "1px solid #6b2d35",
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 12,
};
