"use client";

// app/admin/audit/page.tsx — Track 1 audit log viewer.
//
// WHAT
//   Filterable, paginated table of admin_audit rows. Each row expands to
//   show the before/after JSON in a side-by-side diff. Pagination uses the
//   cursor returned by /api/admin/audit (ts|id pair).
//
// WHY a client component
//   Filters + cursor pagination are stateful and the UX of "click expand"
//   benefits from local React state. The endpoint enforces audit.read
//   permission server-side; this page is client-only sugar.
//
// ENV VARS
//   None directly.

import { Fragment, useEffect, useState } from "react";
import { JsonDiff } from "../_components/JsonDiff";

type Row = {
  id: string;
  admin_id: string | null;
  action: string;
  target_kind: string;
  target_id: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  user_agent: string | null;
  ts: string;
};

type Filters = {
  actor: string;
  action: string;
  kind: string;
  since: string;
  until: string;
};

const EMPTY_FILTERS: Filters = {
  actor: "",
  action: "",
  kind: "",
  since: "",
  until: "",
};

export default function AuditPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load(reset: boolean) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (!reset && cursor) params.set("cursor", cursor);
    if (filters.actor) params.set("actor", filters.actor);
    if (filters.action) params.set("action", filters.action);
    if (filters.kind) params.set("kind", filters.kind);
    if (filters.since) params.set("since", filters.since);
    if (filters.until) params.set("until", filters.until);
    try {
      const res = await fetch(`/api/admin/audit?${params.toString()}`, {
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

  function onApplyFilters(e: React.FormEvent) {
    e.preventDefault();
    setRows([]);
    setCursor(null);
    void load(true);
  }

  function toggleRow(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          AUDIT LOG
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Recent admin actions
        </h1>
      </header>

      <form
        onSubmit={onApplyFilters}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr)) auto",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <input
          placeholder="actor (uuid)"
          value={filters.actor}
          onChange={(e) => setFilters({ ...filters, actor: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="action prefix (e.g. user.)"
          value={filters.action}
          onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="target kind"
          value={filters.kind}
          onChange={(e) => setFilters({ ...filters, kind: e.target.value })}
          style={inputStyle}
        />
        <input
          type="datetime-local"
          value={filters.since}
          onChange={(e) => setFilters({ ...filters, since: e.target.value })}
          style={inputStyle}
          title="since"
        />
        <input
          type="datetime-local"
          value={filters.until}
          onChange={(e) => setFilters({ ...filters, until: e.target.value })}
          style={inputStyle}
          title="until"
        />
        <button type="submit" style={buttonStyle}>
          Apply
        </button>
      </form>

      {error && (
        <div
          style={{
            padding: "8px 10px",
            background: "#3a1f25",
            border: "1px solid #6b2d35",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0e1217", fontSize: 11, opacity: 0.7 }}>
              <th style={th}>Timestamp</th>
              <th style={th}>Actor</th>
              <th style={th}>Action</th>
              <th style={th}>Target</th>
              <th style={th}>IP</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const open = expanded.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => toggleRow(r.id)}
                    style={{
                      cursor: "pointer",
                      borderTop: "1px solid #1f2630",
                      fontSize: 12,
                    }}
                  >
                    <td style={td}>
                      {new Date(r.ts).toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td style={{ ...td, fontFamily: "inherit", opacity: 0.8 }}>
                      {r.admin_id ? r.admin_id.slice(0, 8) : "—"}
                    </td>
                    <td style={td}>
                      <code style={{ color: "#93c5fd" }}>{r.action}</code>
                    </td>
                    <td style={td}>
                      {r.target_kind}/{r.target_id.slice(0, 12)}
                    </td>
                    <td style={td}>{r.ip ?? "—"}</td>
                    <td style={{ ...td, textAlign: "right", opacity: 0.6 }}>
                      {open ? "▾" : "▸"}
                    </td>
                  </tr>
                  {open && (
                    <tr style={{ background: "#0e1217" }}>
                      <td colSpan={6} style={{ padding: 16 }}>
                        <JsonDiff before={r.before} after={r.after} />
                        <div
                          style={{
                            marginTop: 12,
                            fontSize: 11,
                            opacity: 0.6,
                          }}
                        >
                          UA: {r.user_agent ?? "—"}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    opacity: 0.5,
                    fontSize: 13,
                  }}
                >
                  No audit rows match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        {cursor && (
          <button
            onClick={() => void load(false)}
            disabled={loading}
            style={buttonStyle}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
        <button onClick={() => void load(true)} disabled={loading} style={buttonStyle}>
          Refresh
        </button>
      </div>
    </div>
  );
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

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 500,
};

const td: React.CSSProperties = {
  padding: "8px 12px",
  verticalAlign: "top",
};
