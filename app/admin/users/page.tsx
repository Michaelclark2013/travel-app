// app/admin/users/page.tsx — Track 2 user search & management table.
//
// WHAT
//   Virtual-scrolled table of users with full-text search across
//   email/username/display_name/bio (debounced 300ms), date-range filters
//   (signup, last active), country (matched against bio for now), Pro
//   status, and ban status. Pagination is cursor-based — clicking
//   "Load more" appends.
//
// WHY a client component
//   Filters change rapidly and the search debounces; doing this server-side
//   would require a server action per keystroke. The page uses
//   /api/admin/users (gated by users.read on the server) for data.
//
// PERMISSION GATE
//   users.read (server enforced via /api/admin/users; UI also wraps action
//   buttons in <RequirePerm> for defense-in-depth).
//
// ENV VARS
//   None on the client; SUPABASE_SERVICE_ROLE_KEY is required server-side.

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RequirePerm } from "@/lib/admin/RequirePerm";

type UserRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  pro: boolean;
  deleted_at: string | null;
  hidden_at: string | null;
  featured_at: string | null;
};

type Filters = {
  q: string;
  signupFrom: string;
  signupTo: string;
  activeFrom: string;
  activeTo: string;
  country: string;
  pro: "" | "true" | "false";
  banned: "" | "true" | "false";
};

const EMPTY_FILTERS: Filters = {
  q: "",
  signupFrom: "",
  signupTo: "",
  activeFrom: "",
  activeTo: "",
  country: "",
  pro: "",
  banned: "",
};

export default function UsersPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Debounce q.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  const load = useCallback(
    async (append: boolean) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (filters.signupFrom) params.set("signupFrom", filters.signupFrom);
      if (filters.signupTo) params.set("signupTo", filters.signupTo);
      if (filters.activeFrom) params.set("activeFrom", filters.activeFrom);
      if (filters.activeTo) params.set("activeTo", filters.activeTo);
      if (filters.country) params.set("country", filters.country);
      if (filters.pro) params.set("pro", filters.pro);
      if (filters.banned) params.set("banned", filters.banned);
      if (append && cursor) params.set("cursor", cursor);
      try {
        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!data.ok) {
          setError(data.error ?? "request failed");
          setLoading(false);
          return;
        }
        if (append) {
          setRows((prev) => [...prev, ...data.rows]);
        } else {
          setRows(data.rows);
        }
        setCursor(data.nextCursor ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [
      debouncedQ,
      filters.signupFrom,
      filters.signupTo,
      filters.activeFrom,
      filters.activeTo,
      filters.country,
      filters.pro,
      filters.banned,
      cursor,
    ]
  );

  // Reload from scratch whenever a filter changes (cursor reset).
  useEffect(() => {
    setCursor(null);
    setSelected(new Set());
    void load(false);
    // We intentionally exclude `cursor` and `load` from deps to avoid loops;
    // load is stable per-filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedQ,
    filters.signupFrom,
    filters.signupTo,
    filters.activeFrom,
    filters.activeTo,
    filters.country,
    filters.pro,
    filters.banned,
  ]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.user_id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <header style={{ marginBottom: 16, display: "flex", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>USERS</div>
          <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
            User management
          </h1>
        </div>
        <div style={{ flex: 1 }} />
        <RequirePerm perm="users.suspend">
          <BulkActionBar
            selected={selected}
            onDone={() => {
              setSelected(new Set());
              void load(false);
            }}
          />
        </RequirePerm>
      </header>

      <FiltersBar filters={filters} onChange={setFilters} />

      {error ? (
        <div style={{ padding: 12, background: "#1f0d10", color: "#ff8b9b", marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <VirtualTable
        rows={rows}
        loading={loading}
        allSelected={allSelected}
        toggleAll={toggleAll}
        selected={selected}
        toggleOne={toggleOne}
      />

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ opacity: 0.6, fontSize: 12 }}>
          {rows.length} row{rows.length === 1 ? "" : "s"}
          {selected.size ? ` · ${selected.size} selected` : ""}
        </span>
        <div style={{ flex: 1 }} />
        {cursor ? (
          <button
            onClick={() => load(true)}
            disabled={loading}
            style={btn()}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FiltersBar
// ---------------------------------------------------------------------------
function FiltersBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  function set<K extends keyof Filters>(k: K, v: Filters[K]) {
    onChange({ ...filters, [k]: v });
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        marginBottom: 12,
        padding: 12,
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 6,
      }}
    >
      <input
        placeholder="Search email, username, name, bio…"
        value={filters.q}
        onChange={(e) => set("q", e.target.value)}
        style={input()}
      />
      <input
        placeholder="Country (e.g. US)"
        value={filters.country}
        onChange={(e) => set("country", e.target.value)}
        style={input()}
      />
      <select value={filters.pro} onChange={(e) => set("pro", e.target.value as Filters["pro"])} style={input()}>
        <option value="">Pro: any</option>
        <option value="true">Pro only</option>
        <option value="false">Non-pro only</option>
      </select>
      <select value={filters.banned} onChange={(e) => set("banned", e.target.value as Filters["banned"])} style={input()}>
        <option value="">Ban: any</option>
        <option value="true">Banned</option>
        <option value="false">Active</option>
      </select>
      <label style={lbl()}>
        <span>Signup ≥</span>
        <input
          type="date"
          value={filters.signupFrom}
          onChange={(e) => set("signupFrom", e.target.value)}
          style={input()}
        />
      </label>
      <label style={lbl()}>
        <span>Signup ≤</span>
        <input
          type="date"
          value={filters.signupTo}
          onChange={(e) => set("signupTo", e.target.value)}
          style={input()}
        />
      </label>
      <label style={lbl()}>
        <span>Active ≥</span>
        <input
          type="date"
          value={filters.activeFrom}
          onChange={(e) => set("activeFrom", e.target.value)}
          style={input()}
        />
      </label>
      <label style={lbl()}>
        <span>Active ≤</span>
        <input
          type="date"
          value={filters.activeTo}
          onChange={(e) => set("activeTo", e.target.value)}
          style={input()}
        />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VirtualTable — light-weight virtualization based on viewport scrollTop.
// We don't import a vendor lib (no new deps). The table renders only the
// rows in view + a small overscan, which is enough for the 1k-row admin
// surface.
// ---------------------------------------------------------------------------
const ROW_HEIGHT = 40;
const OVERSCAN = 5;

function VirtualTable({
  rows,
  loading,
  allSelected,
  toggleAll,
  selected,
  toggleOne,
}: {
  rows: UserRow[];
  loading: boolean;
  allSelected: boolean;
  toggleAll: () => void;
  selected: Set<string>;
  toggleOne: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewport(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll);
    const ro = new ResizeObserver(() => setViewport(el.clientHeight));
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, start + Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2);
  const visible = useMemo(() => rows.slice(start, end), [rows, start, end]);

  return (
    <div
      style={{
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "32px 220px 200px 160px 100px 80px 80px 100px",
          padding: "8px 12px",
          borderBottom: "1px solid #1f2630",
          fontSize: 11,
          opacity: 0.7,
          letterSpacing: 1,
        }}
      >
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        <div>USER</div>
        <div>EMAIL</div>
        <div>SIGNUP</div>
        <div>LAST ACTIVE</div>
        <div>PRO</div>
        <div>BAN</div>
        <div>ACTIONS</div>
      </div>
      <div
        ref={containerRef}
        style={{ height: 600, overflowY: "auto", position: "relative" }}
      >
        {loading && rows.length === 0 ? (
          <div style={{ padding: 24, opacity: 0.6 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, opacity: 0.6 }}>No users match these filters.</div>
        ) : (
          <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: start * ROW_HEIGHT,
                left: 0,
                right: 0,
              }}
            >
              {visible.map((r) => (
                <UserRowView
                  key={r.user_id}
                  row={r}
                  selected={selected.has(r.user_id)}
                  toggle={() => toggleOne(r.user_id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UserRowView({
  row,
  selected,
  toggle,
}: {
  row: UserRow;
  selected: boolean;
  toggle: () => void;
}) {
  const banned = row.banned_until && new Date(row.banned_until) > new Date();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 220px 200px 160px 100px 80px 80px 100px",
        padding: "10px 12px",
        height: ROW_HEIGHT,
        alignItems: "center",
        borderBottom: "1px solid #1a1f28",
        fontSize: 12,
        background: selected ? "#1a2230" : "transparent",
      }}
    >
      <input type="checkbox" checked={selected} onChange={toggle} />
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <div style={{ fontWeight: 600 }}>{row.display_name ?? row.username ?? "—"}</div>
        <div style={{ opacity: 0.5, fontSize: 11 }}>@{row.username ?? row.user_id.slice(0, 8)}</div>
      </div>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.85 }}>
        {row.email ?? "—"}
      </div>
      <div style={{ opacity: 0.7 }}>{fmtDate(row.created_at)}</div>
      <div style={{ opacity: 0.7 }}>{fmtDate(row.last_sign_in_at)}</div>
      <div>{row.pro ? "✓" : ""}</div>
      <div style={{ color: banned ? "#ff8b9b" : "#9ba3ad" }}>{banned ? "BAN" : ""}</div>
      <div>
        <Link href={`/admin/users/${row.user_id}`} style={{ color: "#93c5fd", fontSize: 12 }}>
          Open
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BulkActionBar — visible to anyone with users.suspend.
// ---------------------------------------------------------------------------
function BulkActionBar({
  selected,
  onDone,
}: {
  selected: Set<string>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (selected.size === 0) return null;

  async function run(action: "hide" | "restore" | "delete") {
    if (!confirm(`Apply ${action} to ${selected.size} user(s)?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          target_kind: "user",
          ids: Array.from(selected),
          dry_run: false,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(`Failed to enqueue: ${data.error}`);
      } else {
        // Kick the worker.
        await fetch(`/api/admin/bulk/${data.jobId}/run`, {
          method: "POST",
          credentials: "include",
        });
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={() => run("hide")} disabled={busy} style={btn()}>
        Hide
      </button>
      <button onClick={() => run("restore")} disabled={busy} style={btn()}>
        Restore
      </button>
      <RequirePerm perm="users.delete">
        <button onClick={() => run("delete")} disabled={busy} style={btn("danger")}>
          Delete
        </button>
      </RequirePerm>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style helpers — kept inline so this page stays vendor-free.
// ---------------------------------------------------------------------------
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
function lbl() {
  return {
    display: "flex",
    flexDirection: "column" as const,
    fontSize: 11,
    opacity: 0.7,
    gap: 2,
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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}
