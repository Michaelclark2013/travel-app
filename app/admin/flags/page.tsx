"use client";

// app/admin/flags/page.tsx — Track 6 feature-flag admin.
//
// WHAT
//   - Tab 1 (Flags): list, filter, edit. Click a row to expand inline form.
//     Edits POST to /api/admin/flags which audit-logs and busts cache.
//   - Tab 2 (Kill switches): same dataset, filtered to kind=kill_switch,
//     red-bordered cards with a big "Kill" button.
//
// WHY a client component
//   Heavy stateful UI (filters, inline edit, optimistic updates) reads better
//   as client React. Auth happens server-side at /api/admin/flags/* which
//   re-checks flags.read / flags.write / flags.kill via requirePerm().
//
// ENV VARS
//   None directly.

import { useEffect, useMemo, useState } from "react";

type FlagKind = "boolean" | "percentage" | "cohort" | "kill_switch";

type Flag = {
  key: string;
  description: string | null;
  kind: FlagKind;
  value: Record<string, unknown>;
  target: Record<string, unknown> | null;
  enabled: boolean;
  updated_at: string;
};

type Tab = "flags" | "kill";

export default function FlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [tab, setTab] = useState<Tab>("flags");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/flags", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setFlags(data.flags ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const filtered = flags.filter((f) => {
      if (tab === "kill" && f.kind !== "kill_switch") return false;
      if (tab === "flags" && f.kind === "kill_switch") return false;
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        f.key.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q)
      );
    });
    return filtered;
  }, [flags, tab, filter]);

  async function saveFlag(patch: Partial<Flag> & { key: string }) {
    const res = await fetch("/api/admin/flags", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? `Save failed (${res.status})`);
      return false;
    }
    await load();
    return true;
  }

  async function deleteFlag(key: string) {
    if (!confirm(`Delete flag "${key}"? This is logged to the audit trail.`)) return;
    const res = await fetch(`/api/admin/flags/${encodeURIComponent(key)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Delete failed (${res.status})`);
      return;
    }
    await load();
  }

  async function killFlag(f: Flag) {
    if (!confirm(`KILL "${f.key}"? Feature will go offline immediately.`)) return;
    const ok = await saveFlag({
      key: f.key,
      kind: "kill_switch",
      value: { killed: true },
      enabled: true,
      description: f.description,
      target: f.target,
    });
    if (ok) alert(`"${f.key}" killed.`);
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>FLAGS</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Feature flags
        </h1>
      </header>

      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        <TabButton active={tab === "flags"} onClick={() => setTab("flags")}>
          Flags
        </TabButton>
        <TabButton active={tab === "kill"} onClick={() => setTab("kill")}>
          Kill switches
        </TabButton>
        <div style={{ flex: 1 }} />
        <input
          placeholder="filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={inputStyle}
        />
        <button onClick={() => setCreating((v) => !v)} style={buttonStyle}>
          {creating ? "Cancel" : "+ New"}
        </button>
      </div>

      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}

      {creating && (
        <FlagEditor
          initial={{
            key: "",
            description: "",
            kind: tab === "kill" ? "kill_switch" : "boolean",
            value: tab === "kill" ? { killed: false } : { on: false },
            target: null,
            enabled: false,
            updated_at: "",
          }}
          isNew
          onCancel={() => setCreating(false)}
          onSave={async (patch) => {
            const ok = await saveFlag(patch);
            if (ok) setCreating(false);
          }}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((f) => (
          <div
            key={f.key}
            style={{
              border: tab === "kill"
                ? "1px solid #6b2d35"
                : "1px solid #1f2630",
              background: tab === "kill" ? "#1a1015" : "#11151a",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              onClick={() =>
                setExpanded((cur) => (cur === f.key ? null : f.key))
              }
              style={{
                padding: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <code style={{ color: "#93c5fd", fontSize: 13, flex: 1 }}>
                {f.key}
              </code>
              <span style={{ fontSize: 11, opacity: 0.6 }}>{f.kind}</span>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: f.enabled ? "#143d2b" : "#1f2630",
                  color: f.enabled ? "#4ade80" : "#9ba3ad",
                }}
              >
                {f.enabled ? "ON" : "off"}
              </span>
              {tab === "kill" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void killFlag(f);
                  }}
                  style={killButtonStyle}
                >
                  KILL
                </button>
              )}
              <span style={{ opacity: 0.5 }}>{expanded === f.key ? "▾" : "▸"}</span>
            </div>
            {expanded === f.key && (
              <div style={{ padding: 16, borderTop: "1px solid #1f2630" }}>
                <FlagEditor
                  initial={f}
                  onSave={async (patch) => {
                    const ok = await saveFlag(patch);
                    if (ok) setExpanded(null);
                  }}
                  onCancel={() => setExpanded(null)}
                  onDelete={() => deleteFlag(f.key)}
                />
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={emptyStyle}>No flags match.</div>
        )}
      </div>

      {loading && <div style={{ opacity: 0.5, marginTop: 12 }}>Loading…</div>}
    </div>
  );
}

function FlagEditor({
  initial,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Flag;
  isNew?: boolean;
  onSave: (patch: Partial<Flag> & { key: string }) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [key, setKey] = useState(initial.key);
  const [desc, setDesc] = useState(initial.description ?? "");
  const [kind, setKind] = useState<FlagKind>(initial.kind);
  const [valueJson, setValueJson] = useState(
    JSON.stringify(initial.value ?? {}, null, 2)
  );
  const [targetJson, setTargetJson] = useState(
    JSON.stringify(initial.target ?? {}, null, 2)
  );
  const [enabled, setEnabled] = useState(initial.enabled);
  const [parseError, setParseError] = useState("");

  function submit() {
    setParseError("");
    let value: Record<string, unknown>;
    let target: Record<string, unknown> | null;
    try {
      value = JSON.parse(valueJson || "{}");
    } catch {
      setParseError("value is not valid JSON.");
      return;
    }
    try {
      const t = targetJson.trim();
      target = t ? JSON.parse(t) : null;
      if (target && Object.keys(target).length === 0) target = null;
    } catch {
      setParseError("target is not valid JSON.");
      return;
    }
    void onSave({ key, description: desc || null, kind, value, target, enabled });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <label style={labelStyle}>
          <span style={labelTextStyle}>key</span>
          <input
            value={key}
            disabled={!isNew}
            onChange={(e) => setKey(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as FlagKind)}
            style={inputStyle}
          >
            <option value="boolean">boolean</option>
            <option value="percentage">percentage</option>
            <option value="cohort">cohort</option>
            <option value="kill_switch">kill_switch</option>
          </select>
        </label>
        <label style={{ ...labelStyle, alignItems: "center", flexDirection: "row" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span style={{ marginLeft: 6 }}>enabled</span>
        </label>
      </div>
      <label style={labelStyle}>
        <span style={labelTextStyle}>description</span>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={labelTextStyle}>
          value (json — e.g. {`{"on": true}`} or {`{"percent": 25}`})
        </span>
        <textarea
          value={valueJson}
          onChange={(e) => setValueJson(e.target.value)}
          style={{ ...inputStyle, fontFamily: "inherit", minHeight: 60 }}
        />
      </label>
      <label style={labelStyle}>
        <span style={labelTextStyle}>
          target (json — cohort rules, e.g. {`{"country": ["US"]}`})
        </span>
        <textarea
          value={targetJson}
          onChange={(e) => setTargetJson(e.target.value)}
          style={{ ...inputStyle, fontFamily: "inherit", minHeight: 60 }}
        />
      </label>
      {parseError && <div style={errorBoxStyle}>{parseError}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} style={primaryButtonStyle}>
          Save
        </button>
        <button onClick={onCancel} style={buttonStyle}>
          Cancel
        </button>
        <div style={{ flex: 1 }} />
        {onDelete && (
          <button onClick={onDelete} style={dangerButtonStyle}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#1f2630" : "transparent",
        border: "1px solid #2a3340",
        color: "#e6e8eb",
        padding: "6px 14px",
        borderRadius: 6,
        fontFamily: "inherit",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
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
  width: "100%",
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

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#1e3a8a",
  borderColor: "#3b82f6",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#3a1f25",
  borderColor: "#6b2d35",
  color: "#fca5a5",
};

const killButtonStyle: React.CSSProperties = {
  ...dangerButtonStyle,
  fontWeight: 700,
  letterSpacing: 1,
  padding: "6px 16px",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  flex: 1,
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.6,
  letterSpacing: 1,
};

const errorBoxStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#3a1f25",
  border: "1px solid #6b2d35",
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 12,
};

const emptyStyle: React.CSSProperties = {
  padding: 24,
  background: "#11151a",
  border: "1px dashed #1f2630",
  borderRadius: 8,
  textAlign: "center",
  fontSize: 13,
  opacity: 0.6,
};
