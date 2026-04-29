"use client";

// app/admin/compliance/page.tsx — Track 8 DSAR inbox.
//
// Lists every Data Subject Access Request — exports + erasures — with their
// status. Click a row to open /admin/compliance/[requestId].

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  user_id: string;
  kind: "export" | "erasure";
  status: "received" | "processing" | "fulfilled" | "rejected";
  requested_at: string;
  fulfilled_at: string | null;
  expires_at: string | null;
  download_url: string | null;
  notes: string | null;
};

export default function ComplianceInboxPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (kindFilter) params.set("kind", kindFilter);
      const res = await fetch(`/api/admin/compliance/dsar?${params}`, {
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, kindFilter]);

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>COMPLIANCE</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          DSAR inbox
        </h1>
        <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
          Right-to-export and right-to-erasure requests.{" "}
          <Link href="/admin/compliance/retention" style={{ color: "#93c5fd" }}>
            Retention policies
          </Link>
          {" · "}
          <Link href="/admin/compliance/dpa" style={{ color: "#93c5fd" }}>
            DPA documents
          </Link>
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={inputStyle}
        >
          <option value="">All statuses</option>
          <option value="received">Received</option>
          <option value="processing">Processing</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          style={inputStyle}
        >
          <option value="">All kinds</option>
          <option value="export">Export</option>
          <option value="erasure">Erasure</option>
        </select>
        <button onClick={() => void load()} style={buttonStyle}>
          Refresh
        </button>
      </div>

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
              <th style={th}>Requested</th>
              <th style={th}>Kind</th>
              <th style={th}>Status</th>
              <th style={th}>User</th>
              <th style={th}>ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                style={{ borderTop: "1px solid #1f2630", fontSize: 12, cursor: "pointer" }}
                onClick={() => {
                  window.location.href = `/admin/compliance/${r.id}`;
                }}
              >
                <td style={td}>
                  {new Date(r.requested_at).toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td style={td}>
                  <code style={{ color: r.kind === "erasure" ? "#fca5a5" : "#93c5fd" }}>
                    {r.kind}
                  </code>
                </td>
                <td style={td}>
                  <StatusPill status={r.status} />
                </td>
                <td style={{ ...td, opacity: 0.8 }}>{r.user_id.slice(0, 8)}</td>
                <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
                  {r.id}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    opacity: 0.5,
                    fontSize: 13,
                  }}
                >
                  No DSAR requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Row["status"] }) {
  const colors: Record<Row["status"], { bg: string; fg: string }> = {
    received: { bg: "#1f2630", fg: "#93c5fd" },
    processing: { bg: "#3a2e1f", fg: "#fcd34d" },
    fulfilled: { bg: "#1f3a2c", fg: "#86efac" },
    rejected: { bg: "#3a1f25", fg: "#fca5a5" },
  };
  const c = colors[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
      }}
    >
      {status}
    </span>
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
