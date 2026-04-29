"use client";

// app/admin/compliance/dpa/page.tsx — Track 8 DPA/SCC document store.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Doc = {
  id: string;
  kind: "dpa" | "scc" | "privacy" | "tos" | "other";
  title: string;
  version: string;
  signed_at: string | null;
  signed_by: string | null;
  storage_path: string;
  created_at: string;
  signed_url: string | null;
};

export default function DpaPage() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Doc["kind"]>("dpa");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [signedBy, setSignedBy] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/admin/compliance/dpa", { credentials: "include" });
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

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Select a file");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      fd.set("title", title);
      fd.set("version", version);
      if (signedAt) fd.set("signed_at", new Date(signedAt).toISOString());
      if (signedBy) fd.set("signed_by", signedBy);
      const res = await fetch("/api/admin/compliance/dpa", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
      } else {
        setTitle("");
        setVersion("");
        setSignedAt("");
        setSignedBy("");
        if (fileRef.current) fileRef.current.value = "";
        await load();
      }
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>COMPLIANCE</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          DPA &amp; legal documents
        </h1>
        <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
          Signed DPAs, SCCs, and historical privacy / ToS versions.{" "}
          <Link href="/admin/compliance" style={{ color: "#93c5fd" }}>
            Back to inbox
          </Link>
        </p>
      </header>

      <form
        onSubmit={upload}
        style={{
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <select value={kind} onChange={(e) => setKind(e.target.value as Doc["kind"])} style={inputStyle}>
          <option value="dpa">DPA</option>
          <option value="scc">SCC</option>
          <option value="privacy">Privacy notice</option>
          <option value="tos">Terms of service</option>
          <option value="other">Other</option>
        </select>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          placeholder="Version"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="date"
          value={signedAt}
          onChange={(e) => setSignedAt(e.target.value)}
          style={inputStyle}
          title="Signed at"
        />
        <input
          placeholder="Signed by"
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
          style={inputStyle}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          required
          style={{ ...inputStyle, padding: 4 }}
        />
        <button
          type="submit"
          disabled={uploading}
          style={{ ...buttonStyle, gridColumn: "1 / span 2" }}
        >
          {uploading ? "Uploading…" : "Upload document"}
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
              <th style={th}>Created</th>
              <th style={th}>Kind</th>
              <th style={th}>Title</th>
              <th style={th}>Version</th>
              <th style={th}>Signed</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} style={{ borderTop: "1px solid #1f2630", fontSize: 12 }}>
                <td style={td}>
                  {new Date(d.created_at).toISOString().slice(0, 10)}
                </td>
                <td style={td}>
                  <code>{d.kind}</code>
                </td>
                <td style={td}>{d.title}</td>
                <td style={td}>{d.version}</td>
                <td style={td}>
                  {d.signed_at
                    ? `${new Date(d.signed_at).toISOString().slice(0, 10)} by ${d.signed_by ?? "—"}`
                    : "—"}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  {d.signed_url ? (
                    <a
                      href={d.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#93c5fd" }}
                    >
                      Download
                    </a>
                  ) : (
                    <span style={{ opacity: 0.5 }}>no link</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: 24, textAlign: "center", opacity: 0.5, fontSize: 13 }}
                >
                  No documents yet.
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
  padding: "8px 12px",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 13,
  cursor: "pointer",
};
const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "8px 12px", verticalAlign: "top" };
