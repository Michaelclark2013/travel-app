"use client";

// app/admin/compliance/[requestId]/page.tsx — Track 8 DSAR detail.
//
// For 'export' DSARs:
//   - "Build export" button -> /api/admin/compliance/export/[id]/run
//   - Renders the signed download URL when fulfilled.
//
// For 'erasure' DSARs:
//   - "Run dry-run" -> shows row counts of what would be deleted.
//   - "Confirm erase" gated by typing the user's email.

import { use, useEffect, useState } from "react";

type Row = {
  id: string;
  user_id: string;
  email: string | null;
  kind: "export" | "erasure";
  status: "received" | "processing" | "fulfilled" | "rejected";
  requested_at: string;
  fulfilled_at: string | null;
  expires_at: string | null;
  download_url: string | null;
  notes: string | null;
};

export default function DsarDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Erasure-only state.
  const [dryRun, setDryRun] = useState<{ counts: Record<string, number>; email: string | null } | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [receipt, setReceipt] = useState<unknown>(null);

  async function load() {
    try {
      const res = await fetch(`/api/admin/compliance/dsar/${requestId}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setRow(data.row);
    } catch {
      setError("Network error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function buildExport() {
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/compliance/export/${row.id}/run`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
      } else {
        await load();
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function runDryRun() {
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/compliance/erase/${row.id}?mode=dry-run`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
      } else {
        setDryRun({ counts: data.counts, email: data.email });
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmErase() {
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/compliance/erase/${row.id}?mode=confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: confirmEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
      } else {
        setReceipt(data.receipt);
        await load();
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!row && !error) {
    return <div style={{ opacity: 0.6 }}>Loading…</div>;
  }
  if (!row) {
    return <div style={{ color: "#fca5a5" }}>{error}</div>;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          DSAR · {row.kind.toUpperCase()}
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Request {row.id}
        </h1>
      </header>

      <Section title="Details">
        <Field k="User">{row.email ?? row.user_id}</Field>
        <Field k="User ID"><code>{row.user_id}</code></Field>
        <Field k="Status">{row.status}</Field>
        <Field k="Requested">{new Date(row.requested_at).toLocaleString()}</Field>
        {row.fulfilled_at && (
          <Field k="Fulfilled">{new Date(row.fulfilled_at).toLocaleString()}</Field>
        )}
        {row.expires_at && (
          <Field k="Link expires">{new Date(row.expires_at).toLocaleString()}</Field>
        )}
        {row.notes && <Field k="Notes">{row.notes}</Field>}
      </Section>

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

      {row.kind === "export" && (
        <Section title="Build export">
          {row.download_url ? (
            <>
              <p style={{ fontSize: 13, opacity: 0.85 }}>
                Archive ready. Signed link valid until{" "}
                {row.expires_at ? new Date(row.expires_at).toLocaleString() : "unknown"}.
              </p>
              <a
                href={row.download_url}
                target="_blank"
                rel="noreferrer"
                style={{ ...buttonStyle, display: "inline-block", color: "#93c5fd" }}
              >
                Download archive
              </a>
              <button
                disabled={busy}
                style={{ ...buttonStyle, marginLeft: 8 }}
                onClick={() => void buildExport()}
              >
                Rebuild
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              style={buttonStyle}
              onClick={() => void buildExport()}
            >
              {busy ? "Building…" : "Build export"}
            </button>
          )}
        </Section>
      )}

      {row.kind === "erasure" && (
        <Section title="Erase user data">
          {!dryRun ? (
            <button
              disabled={busy || row.status === "fulfilled"}
              style={buttonStyle}
              onClick={() => void runDryRun()}
            >
              {busy ? "Running…" : "Run dry-run"}
            </button>
          ) : (
            <>
              <p style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                Cascade preview:
              </p>
              <pre
                style={{
                  background: "#0b0d10",
                  border: "1px solid #1f2630",
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 11,
                  overflow: "auto",
                  marginBottom: 12,
                }}
              >
                {JSON.stringify(dryRun.counts, null, 2)}
              </pre>
              <p style={{ fontSize: 13 }}>
                To confirm, type the user&apos;s email:{" "}
                <code>{dryRun.email ?? row.email ?? "(unknown)"}</code>
              </p>
              <input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="user email"
                style={{ ...inputStyle, width: "100%", marginTop: 8 }}
              />
              <button
                disabled={busy || !confirmEmail || row.status === "fulfilled"}
                onClick={() => void confirmErase()}
                style={{
                  ...buttonStyle,
                  marginTop: 12,
                  background: "#3a1f25",
                  borderColor: "#6b2d35",
                  color: "#fca5a5",
                }}
              >
                {busy ? "Erasing…" : "Confirm erase"}
              </button>
            </>
          )}
          {receipt !== null && (
            <>
              <p style={{ fontSize: 13, marginTop: 16 }}>Receipt:</p>
              <pre
                style={{
                  background: "#0b0d10",
                  border: "1px solid #1f2630",
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 11,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(receipt, null, 2)}
              </pre>
            </>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          opacity: 0.6,
          letterSpacing: 1,
          marginBottom: 10,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 13, marginBottom: 6 }}>
      <div style={{ opacity: 0.6 }}>{k}</div>
      <div>{children}</div>
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
  textDecoration: "none",
};
