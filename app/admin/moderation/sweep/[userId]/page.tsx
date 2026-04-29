"use client";

// app/admin/moderation/sweep/[userId]/page.tsx — Track 3 user sweep tool.
//
// WHAT
//   For a given user, batch-classify their last 200 moments + comments via
//   POST /api/moderation/sweep. Renders a live progress + per-row outcome
//   list. Concurrency is enforced server-side (cap 5 parallel Claude calls).
//
// AUTH (UI gate)
//   <RequirePerm perm="moderation.action"> — sweeping costs Claude tokens.
//
// NOTE on Next 16 params
//   Page receives `params: Promise<{ userId }>`. We unwrap with React.use().

import { use, useCallback, useState } from "react";
import { RequirePerm } from "@/lib/admin/RequirePerm";

type SweepRow = {
  kind: string;
  id: string;
  status: string;
  autoAction: string | null;
  scores: Record<string, number> | null;
  pattern?: string;
  error?: string;
};

export default function SweepPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  return (
    <RequirePerm
      perm="moderation.action"
      fallback={
        <div style={{ padding: 24, opacity: 0.7, fontSize: 13 }}>
          You don&apos;t have moderation.action permission.
        </div>
      }
    >
      <SweepRunner userId={userId} />
    </RequirePerm>
  );
}

function SweepRunner({ userId }: { userId: string }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SweepRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  const start = useCallback(async () => {
    setRunning(true);
    setError("");
    setResults([]);
    setTotal(null);
    try {
      const res = await fetch("/api/moderation/sweep", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, kinds: ["moment", "comment"] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setTotal(data.total ?? 0);
      setResults(data.results ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setRunning(false);
    }
  }, [userId]);

  const summary = summarize(results);

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          MODERATION / SWEEP
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Sweep user
        </h1>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          User id: <code>{userId}</code> — runs the classifier over their last
          200 moments + comments. Cap 5 parallel Claude calls.
        </div>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={start}
          disabled={running}
          style={{
            padding: "8px 14px",
            background: running ? "#1f2630" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            cursor: running ? "wait" : "pointer",
          }}
        >
          {running ? "Sweeping…" : "Run sweep"}
        </button>
        <a
          href="/admin/moderation"
          style={{
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid #2a3340",
            color: "#e6e8eb",
            borderRadius: 6,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Back to queue
        </a>
      </div>

      {error ? (
        <div
          style={{
            padding: 12,
            background: "#3a1d20",
            border: "1px solid #7a2c33",
            borderRadius: 6,
            color: "#fbb",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {total !== null ? (
        <div
          style={{
            padding: 12,
            background: "#11151a",
            border: "1px solid #1f2630",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 13,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span>Total: {total}</span>
          <span style={{ color: "#bbf5c5" }}>Approved: {summary.approved}</span>
          <span style={{ color: "#f5e0a3" }}>Pending: {summary.pending}</span>
          <span style={{ color: "#fbb" }}>Rejected: {summary.rejected}</span>
          <span style={{ color: "#9ba3ad" }}>Pattern: {summary.pattern}</span>
          <span style={{ color: "#9ba3ad" }}>Errors: {summary.errors}</span>
        </div>
      ) : null}

      {results.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {results.map((r) => (
            <li
              key={`${r.kind}:${r.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr auto",
                gap: 8,
                alignItems: "center",
                padding: "8px 10px",
                background: "#11151a",
                border: "1px solid #1f2630",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <span style={{ opacity: 0.6 }}>{r.kind}</span>
              <code style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.id}
              </code>
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  background:
                    r.status === "rejected"
                      ? "#3a1d20"
                      : r.status === "approved"
                      ? "#1d3a23"
                      : r.status === "escalated"
                      ? "#1d2a3a"
                      : "#3a311d",
                  color:
                    r.status === "rejected"
                      ? "#fbb"
                      : r.status === "approved"
                      ? "#bbf5c5"
                      : r.status === "escalated"
                      ? "#a3c5f5"
                      : "#f5e0a3",
                }}
              >
                {r.pattern ? `pattern:${r.pattern}` : r.status}
                {r.error ? ` (err)` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function summarize(rows: SweepRow[]) {
  const out = { approved: 0, rejected: 0, pending: 0, pattern: 0, errors: 0 };
  for (const r of rows) {
    if (r.error) out.errors++;
    if (r.pattern) out.pattern++;
    if (r.status === "approved") out.approved++;
    else if (r.status === "rejected") out.rejected++;
    else if (r.status === "pending") out.pending++;
  }
  return out;
}
