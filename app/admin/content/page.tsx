// app/admin/content/page.tsx — Track 2 unified content management.
//
// WHAT
//   Tabbed list (Moments / Trips / Comments / DMs). Filters: author, date
//   range, flagged-only. Bulk actions: hide, restore, delete, feature.
//
//   DMs require an explicit non-empty `reason` text plus content.read; the
//   server route audit-logs every page view.
//
// PERMISSION GATE
//   content.read for the page; content.delete and content.feature wrap the
//   bulk action buttons. Server routes re-check.
//
// ENV VARS
//   None on the client.

"use client";

import { useCallback, useEffect, useState } from "react";
import { RequirePerm } from "@/lib/admin/RequirePerm";

type Tab = "moments" | "trips" | "comments" | "dms";

type Row = Record<string, unknown> & {
  id: string;
  created_at: string;
  hidden_at?: string | null;
  deleted_at?: string | null;
  featured_at?: string | null;
};

export default function ContentPage() {
  const [tab, setTab] = useState<Tab>("moments");
  const [author, setAuthor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [reason, setReason] = useState(""); // for DMs
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (append: boolean) => {
      // For dms, refuse to fetch unless reason is non-empty.
      if (tab === "dms" && !reason.trim()) {
        setRows([]);
        setCursor(null);
        return;
      }
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ kind: tab });
      if (author) params.set("author", author);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (flagged) params.set("flagged", "true");
      if (tab === "dms") params.set("reason", reason.trim());
      if (append && cursor) params.set("cursor", cursor);
      try {
        const res = await fetch(`/api/admin/content?${params.toString()}`, {
          credentials: "include",
        });
        const d = await res.json();
        if (!d.ok) {
          setError(d.error ?? "request failed");
          setLoading(false);
          return;
        }
        if (append) setRows((p) => [...p, ...d.rows]);
        else setRows(d.rows);
        setCursor(d.nextCursor ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [tab, author, from, to, flagged, reason, cursor]
  );

  // Reload when any filter changes (cursor reset).
  useEffect(() => {
    setCursor(null);
    setSelected(new Set());
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, author, from, to, flagged, reason]);

  function toggle(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function bulk(action: "hide" | "restore" | "delete" | "feature") {
    if (selected.size === 0) return;
    if (!confirm(`Apply ${action} to ${selected.size} ${tab}?`)) return;
    const targetKind: "moment" | "trip" | "comment" =
      tab === "moments" ? "moment" : tab === "trips" ? "trip" : "comment";
    if (tab === "dms") {
      alert("DMs are read-only here; use the user detail page to action a sender.");
      return;
    }
    const res = await fetch("/api/admin/bulk", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        target_kind: targetKind,
        ids: Array.from(selected),
        dry_run: false,
      }),
    });
    const d = await res.json();
    if (!d.ok) {
      alert(`Bulk failed: ${d.error}`);
      return;
    }
    await fetch(`/api/admin/bulk/${d.jobId}/run`, {
      method: "POST",
      credentials: "include",
    });
    setSelected(new Set());
    await load(false);
  }

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>CONTENT</div>
      <h1 style={{ fontSize: 22, margin: "6px 0 16px", fontWeight: 600 }}>
        Content management
      </h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["moments", "trips", "comments", "dms"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...btn(),
              background: tab === t ? "#1f2630" : "transparent",
              color: tab === t ? "#e6e8eb" : "#9ba3ad",
            }}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          padding: 12,
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 6,
          marginBottom: 12,
        }}
      >
        <input placeholder="Author user-id" value={author} onChange={(e) => setAuthor(e.target.value)} style={input()} />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input()} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input()} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
          Flagged only
        </label>
        {tab === "dms" ? (
          <input
            placeholder="Reason (required for DM access — audit-logged)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ ...input(), gridColumn: "span 4", borderColor: reason.trim() ? "#2a3340" : "#5b1818" }}
          />
        ) : null}
      </div>

      {tab === "dms" && !reason.trim() ? (
        <div
          style={{
            padding: 12,
            background: "#1a1300",
            color: "#ffd28a",
            border: "1px solid #5b3a18",
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          DM access is sensitive. Provide a reason above to load messages — every page
          view is audit-logged. (content.read required.)
        </div>
      ) : null}

      {error ? (
        <div style={{ padding: 12, background: "#1f0d10", color: "#ff8b9b", marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <RequirePerm perm="content.delete">
          <button onClick={() => bulk("hide")} style={btn()} disabled={!selected.size}>Hide ({selected.size})</button>
          <button onClick={() => bulk("restore")} style={btn()} disabled={!selected.size}>Restore</button>
          <button onClick={() => bulk("delete")} style={btn("danger")} disabled={!selected.size}>Delete</button>
        </RequirePerm>
        <RequirePerm perm="content.feature">
          <button onClick={() => bulk("feature")} style={btn()} disabled={!selected.size || tab === "comments" || tab === "dms"}>
            Feature
          </button>
        </RequirePerm>
      </div>

      <div
        style={{
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ opacity: 0.7 }}>
              <th style={th()}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                />
              </th>
              <th style={th()}>ID</th>
              <th style={th()}>AUTHOR</th>
              <th style={th()}>BODY / TITLE</th>
              <th style={th()}>CREATED</th>
              <th style={th()}>STATE</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 24, opacity: 0.6 }}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 24, opacity: 0.6 }}>
                  No rows.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <ContentRowView
                  key={String(r.id)}
                  row={r}
                  tab={tab}
                  selected={selected.has(String(r.id))}
                  toggle={() => toggle(String(r.id))}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ opacity: 0.6, fontSize: 12 }}>
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        <div style={{ flex: 1 }} />
        {cursor ? (
          <button onClick={() => load(true)} style={btn()} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ContentRowView({
  row,
  tab,
  selected,
  toggle,
}: {
  row: Row;
  tab: Tab;
  selected: boolean;
  toggle: () => void;
}) {
  const author = (row["user_id"] ?? row["author_id"] ?? row["from_user_id"] ?? "—") as string;
  const body =
    (row["body"] as string | undefined) ??
    (row["caption"] as string | undefined) ??
    (row["destination"] as string | undefined) ??
    "—";
  const states: string[] = [];
  if (row.deleted_at) states.push("deleted");
  if (row.hidden_at) states.push("hidden");
  if (row.featured_at) states.push("featured");
  return (
    <tr style={{ borderTop: "1px solid #1a1f28", background: selected ? "#1a2230" : "transparent" }}>
      <td style={td()}>
        {tab === "dms" ? null : <input type="checkbox" checked={selected} onChange={toggle} />}
      </td>
      <td style={{ ...td(), maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {String(row.id)}
      </td>
      <td style={{ ...td(), maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {author}
      </td>
      <td style={{ ...td(), maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {body}
      </td>
      <td style={td()}>{fmtDate(String(row.created_at))}</td>
      <td style={td()}>{states.join(" / ") || "—"}</td>
    </tr>
  );
}

function input() {
  return {
    background: "#0b0d10",
    color: "#e6e8eb",
    border: "1px solid #2a3340",
    borderRadius: 4,
    padding: "6px 8px",
    fontSize: 12,
    fontFamily: "inherit",
    width: "100%",
  } as const;
}
function btn(variant: "default" | "danger" = "default") {
  return {
    background: variant === "danger" ? "#3a0d0d" : "transparent",
    color: variant === "danger" ? "#ff8b9b" : "#e6e8eb",
    border: `1px solid ${variant === "danger" ? "#5b1818" : "#2a3340"}`,
    padding: "6px 12px",
    borderRadius: 4,
    fontFamily: "inherit",
    fontSize: 12,
    cursor: "pointer",
  } as const;
}
function th() {
  return { padding: "6px 12px", textAlign: "left" as const, fontSize: 11, letterSpacing: 1 };
}
function td() {
  return { padding: "8px 12px", textAlign: "left" as const, fontSize: 12 };
}
function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return "—";
  }
}
