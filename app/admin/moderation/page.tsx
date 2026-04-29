"use client";

// app/admin/moderation/page.tsx — Track 3 moderation queue.
//
// WHAT
//   Tabbed list of moderation_queue rows: Pending / Auto-approved /
//   Auto-rejected / Escalated. Each row shows a thumbnail (moments) or text
//   snippet (comments / DMs), score chips for the top-3 categories, an
//   "open in context" link, and action buttons (Approve / Reject / Escalate /
//   Apply pattern ban). Subscribes to Realtime so newly-classified rows
//   appear without a refresh.
//
// WHY a client component
//   Queue interaction is interactive (action buttons + live channel). The
//   API endpoints behind the buttons enforce moderation.action server-side;
//   this page is the UI shell.
//
// AUTH (UI gate)
//   Wrapped in <RequirePerm perm="moderation.review">; non-reviewers see a
//   short "no access" stub.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RequirePerm } from "@/lib/admin/RequirePerm";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type Status = "pending" | "approved" | "rejected" | "escalated";

type Preview = {
  kind: string;
  preview: string;
  image?: string;
  author?: string;
};

type Row = {
  id: string;
  target_kind: string;
  target_id: string;
  scores: Record<string, unknown>;
  status: Status;
  auto_action: string | null;
  admin_decision: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  preview: Preview | null;
};

const TABS: Array<{ key: Status | "auto-approved" | "auto-rejected"; label: string; status: Status; auto?: string }> = [
  { key: "pending", label: "Pending", status: "pending" },
  { key: "auto-approved", label: "Auto-approved", status: "approved", auto: "auto-approved" },
  { key: "auto-rejected", label: "Auto-rejected", status: "rejected", auto: "auto-rejected" },
  { key: "escalated", label: "Escalated", status: "escalated" },
];

export default function ModerationPage() {
  return (
    <RequirePerm
      perm="moderation.review"
      fallback={<NoAccess />}
    >
      <ModerationQueue />
    </RequirePerm>
  );
}

function NoAccess() {
  return (
    <div style={{ padding: 24, opacity: 0.7, fontSize: 13 }}>
      You don&apos;t have moderation.review permission.
    </div>
  );
}

function ModerationQueue() {
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [busyRow, setBusyRow] = useState<string>("");

  const tabDef = useMemo(() => TABS.find((t) => t.key === tab) ?? TABS[0], [tab]);

  const loadRef = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("status", tabDef.status);
      params.set("limit", "50");
      const res = await fetch(`/api/moderation/queue?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== loadRef.current) return; // raced
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setRows([]);
        return;
      }
      let next: Row[] = data.rows ?? [];
      if (tabDef.auto) {
        next = next.filter((r) => r.auto_action === tabDef.auto);
      }
      setRows(next);
    } catch {
      setError("Network error.");
    } finally {
      if (seq === loadRef.current) setLoading(false);
    }
  }, [tabDef]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime — listen for queue inserts/updates and refetch on change. We
  // could splice in-place for INSERT but a refetch keeps preview content
  // accurate (auto-rejected rows flip target.hidden_at, which the UI shows).
  useEffect(() => {
    if (!supabaseEnabled || !supabase) return;
    const ch = supabase
      .channel("voyage-moderation-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "moderation_queue" },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [load]);

  async function decide(row: Row, decision: "approve" | "reject" | "escalate") {
    setBusyRow(row.id);
    try {
      const res = await fetch("/api/moderation/decide", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queueId: row.id, decision }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Action failed (${res.status})`);
      }
    } catch {
      setError("Network error during action.");
    } finally {
      setBusyRow("");
      void load();
    }
  }

  async function applyBan(row: Row) {
    const value = window.prompt(
      `Apply pattern ban from this row.\n\nKind: ${row.target_kind}\n\nEnter ban kind (content_hash | keyword_regex | phash | ip | ip_range | fingerprint):`,
      "keyword_regex"
    );
    if (!value) return;
    const v = window.prompt(
      `Value for ${value}:\n` +
        (value === "keyword_regex"
          ? "(JS regex source, no slashes)"
          : "(canonical lowercase form)")
    );
    if (!v) return;
    setBusyRow(row.id);
    try {
      const res = await fetch("/api/moderation/pattern-ban", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: value,
          value: v,
          reason: `Applied from queue row ${row.id}`,
          fromQueueId: row.id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Ban failed (${res.status})`);
      }
    } catch {
      setError("Network error during ban add.");
    } finally {
      setBusyRow("");
      void load();
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          MODERATION
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Queue
        </h1>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          Live — Claude classifier results stream in via Supabase Realtime.
        </div>
      </header>

      {/* Tabs */}
      <nav
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 12,
          borderBottom: "1px solid #1f2630",
        }}
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                borderBottom: active
                  ? "2px solid #93c5fd"
                  : "2px solid transparent",
                color: active ? "#e6e8eb" : "#9ba3ad",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

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

      {loading ? (
        <div style={{ opacity: 0.6, fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: 24,
            background: "#11151a",
            border: "1px dashed #2a3340",
            borderRadius: 8,
            fontSize: 13,
            opacity: 0.7,
          }}
        >
          No rows in {tabDef.label.toLowerCase()}.
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {rows.map((r) => (
            <QueueCard
              key={r.id}
              row={r}
              busy={busyRow === r.id}
              onDecide={decide}
              onBan={applyBan}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueCard({
  row,
  busy,
  onDecide,
  onBan,
}: {
  row: Row;
  busy: boolean;
  onDecide: (row: Row, decision: "approve" | "reject" | "escalate") => void;
  onBan: (row: Row) => void;
}) {
  const top3 = useMemo(() => topScores(row.scores, 3), [row.scores]);
  const ctxHref = contextHref(row);

  return (
    <li
      style={{
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 8,
        padding: 12,
        display: "grid",
        gridTemplateColumns: "72px 1fr auto",
        gap: 12,
        alignItems: "center",
      }}
    >
      {/* Thumbnail / kind chip */}
      <div
        style={{
          width: 72,
          height: 72,
          background: "#0b0d10",
          border: "1px solid #1f2630",
          borderRadius: 6,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          opacity: 0.7,
        }}
      >
        {row.preview?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.preview.image}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            {row.target_kind}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: "#e6e8eb",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {row.preview?.preview ?? <span style={{ opacity: 0.5 }}>(content not found)</span>}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {top3.map((s) => (
            <ScoreChip key={s.cat} cat={s.cat} score={s.score} />
          ))}
          {row.auto_action ? (
            <span
              style={{
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 4,
                background: row.auto_action === "auto-rejected" ? "#3a1d20" : "#1d3a23",
                color: row.auto_action === "auto-rejected" ? "#fbb" : "#bbf5c5",
              }}
            >
              {row.auto_action}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
          {row.target_kind}/{row.target_id} · {new Date(row.created_at).toLocaleString()}
          {ctxHref ? (
            <>
              {" "}
              ·{" "}
              <a href={ctxHref} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>
                open
              </a>
            </>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <RequirePerm perm="moderation.action">
        <div style={{ display: "flex", gap: 6 }}>
          <ActionBtn label="Approve" disabled={busy} onClick={() => onDecide(row, "approve")} />
          <ActionBtn
            label="Reject"
            danger
            disabled={busy}
            onClick={() => onDecide(row, "reject")}
          />
          <ActionBtn
            label="Escalate"
            disabled={busy}
            onClick={() => onDecide(row, "escalate")}
          />
          <ActionBtn label="Ban…" disabled={busy} onClick={() => onBan(row)} />
        </div>
      </RequirePerm>
    </li>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 10px",
        background: "transparent",
        border: `1px solid ${danger ? "#7a2c33" : "#2a3340"}`,
        color: danger ? "#fbb" : "#e6e8eb",
        borderRadius: 6,
        fontFamily: "inherit",
        fontSize: 12,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function ScoreChip({ cat, score }: { cat: string; score: number }) {
  const intensity = Math.min(1, Math.max(0, score));
  const bg =
    intensity >= 0.85
      ? "#3a1d20"
      : intensity >= 0.5
      ? "#3a311d"
      : "#1f2630";
  const fg =
    intensity >= 0.85 ? "#fbb" : intensity >= 0.5 ? "#f5e0a3" : "#9ba3ad";
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 6px",
        borderRadius: 4,
        background: bg,
        color: fg,
      }}
    >
      {cat}: {score.toFixed(2)}
    </span>
  );
}

// Pull the top-K numeric scores out of the JSON blob the queue stores.
function topScores(
  scores: Record<string, unknown>,
  k: number
): Array<{ cat: string; score: number }> {
  const list: Array<{ cat: string; score: number }> = [];
  for (const [cat, val] of Object.entries(scores ?? {})) {
    if (typeof val === "number") list.push({ cat, score: val });
  }
  list.sort((a, b) => b.score - a.score);
  return list.slice(0, k);
}

function contextHref(r: Row): string | null {
  if (r.target_kind === "moment") return `/m/${r.target_id}`;
  if (r.target_kind === "comment") return `/admin/users?comment=${r.target_id}`;
  if (r.target_kind === "dm") return `/admin/inbox?dm=${r.target_id}`;
  return null;
}
