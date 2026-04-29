"use client";

// app/admin/compliance/retention/page.tsx — Track 8 retention policy editor.

import Link from "next/link";
import { useEffect, useState } from "react";

type Policy = {
  table_name: string;
  ttl_days: number;
  last_run_at: string | null;
  last_purged: number;
  updated_at: string;
};

export default function RetentionPage() {
  const [rows, setRows] = useState<Policy[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/compliance/retention", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setRows(data.rows ?? []);
    } catch {
      setError("Network error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(table: string) {
    const ttl = drafts[table] ?? rows.find((r) => r.table_name === table)?.ttl_days ?? 0;
    if (!ttl || ttl <= 0) return;
    setBusy(table);
    setError("");
    try {
      const res = await fetch("/api/admin/compliance/retention", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ table_name: table, ttl_days: ttl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
      } else {
        setDrafts((d) => {
          const next = { ...d };
          delete next[table];
          return next;
        });
        await load();
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>COMPLIANCE</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Retention policies
        </h1>
        <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
          Daily purge runs at 03:00 UTC.{" "}
          <Link href="/admin/compliance" style={{ color: "#93c5fd" }}>
            Back to inbox
          </Link>
        </p>
      </header>

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
              <th style={th}>Table</th>
              <th style={th}>TTL (days)</th>
              <th style={th}>Last run</th>
              <th style={th}>Last purged</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const draft = drafts[p.table_name];
              const dirty = draft !== undefined && draft !== p.ttl_days;
              return (
                <tr key={p.table_name} style={{ borderTop: "1px solid #1f2630", fontSize: 12 }}>
                  <td style={td}>
                    <code>{p.table_name}</code>
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      min={1}
                      value={draft ?? p.ttl_days}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [p.table_name]: Number(e.target.value),
                        }))
                      }
                      style={{ ...inputStyle, width: 100 }}
                    />
                  </td>
                  <td style={{ ...td, opacity: 0.8 }}>
                    {p.last_run_at
                      ? new Date(p.last_run_at).toISOString().replace("T", " ").slice(0, 19)
                      : "—"}
                  </td>
                  <td style={td}>{p.last_purged}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button
                      disabled={!dirty || busy === p.table_name}
                      style={{
                        ...buttonStyle,
                        opacity: dirty ? 1 : 0.4,
                      }}
                      onClick={() => void save(p.table_name)}
                    >
                      {busy === p.table_name ? "Saving…" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: 24, textAlign: "center", opacity: 0.5, fontSize: 13 }}
                >
                  No policies configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "8px 12px", verticalAlign: "top" };
