"use client";

// app/admin/incidents/page.tsx — Track 6 incident timeline.
//
// WHAT
//   - Create new incident (title, severity, public/internal toggle).
//   - List incidents most-recent-first.
//   - Click an incident to expand: shows updates, lets admin post a new
//     update or change status (resolve, etc.).
//
// AUTH
//   /api/admin/incidents/* requires flags.write.
//
// ENV VARS
//   None directly.

import { useEffect, useState } from "react";

type Incident = {
  id: string;
  title: string;
  severity: "minor" | "major" | "critical";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  started_at: string;
  resolved_at: string | null;
  public: boolean;
};

type Update = {
  id: number;
  incident_id: string;
  body: string;
  posted_at: string;
};

const SEVERITIES: Incident["severity"][] = ["minor", "major", "critical"];
const STATUSES: Incident["status"][] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [updatesById, setUpdatesById] = useState<Record<string, Update[]>>({});
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // New-incident form state.
  const [newTitle, setNewTitle] = useState("");
  const [newSev, setNewSev] = useState<Incident["severity"]>("minor");
  const [newPublic, setNewPublic] = useState(true);

  async function load() {
    setError("");
    try {
      const res = await fetch("/api/admin/incidents", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setIncidents(data.incidents ?? []);
    } catch {
      setError("Network error.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function loadUpdates(incidentId: string) {
    const res = await fetch(
      `/api/admin/incidents/${encodeURIComponent(incidentId)}/updates`,
      { credentials: "include" }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setUpdatesById((cur) => ({ ...cur, [incidentId]: data.updates ?? [] }));
    }
  }

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      if (cur === id) return null;
      void loadUpdates(id);
      return id;
    });
  }

  async function createIncident() {
    if (!newTitle.trim()) {
      setError("Title required.");
      return;
    }
    const res = await fetch("/api/admin/incidents", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        severity: newSev,
        public: newPublic,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Create failed (${res.status})`);
      return;
    }
    setNewTitle("");
    setCreating(false);
    await load();
  }

  async function patchIncident(id: string, patch: Partial<Incident>) {
    const res = await fetch(
      `/api/admin/incidents/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Update failed (${res.status})`);
    }
    await load();
  }

  async function postUpdate(incidentId: string, body: string) {
    if (!body.trim()) return;
    const res = await fetch(
      `/api/admin/incidents/${encodeURIComponent(incidentId)}/updates`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Post failed (${res.status})`);
      return;
    }
    await loadUpdates(incidentId);
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>INCIDENTS</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Incident timeline
        </h1>
      </header>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setCreating((v) => !v)} style={primaryButtonStyle}>
          {creating ? "Cancel" : "+ New incident"}
        </button>
      </div>

      {creating && (
        <div
          style={{
            padding: 16,
            background: "#11151a",
            border: "1px solid #1f2630",
            borderRadius: 8,
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <input
            placeholder="title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={newSev}
              onChange={(e) =>
                setNewSev(e.target.value as Incident["severity"])
              }
              style={inputStyle}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={newPublic}
                onChange={(e) => setNewPublic(e.target.checked)}
              />
              public
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={createIncident} style={primaryButtonStyle}>
              Create
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {incidents.map((i) => (
          <div
            key={i.id}
            style={{
              border: "1px solid #1f2630",
              background: i.status === "resolved" ? "#0e1217" : "#11151a",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              onClick={() => toggleExpand(i.id)}
              style={{
                padding: 12,
                cursor: "pointer",
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <SeverityBadge severity={i.severity} />
              <span style={{ flex: 1 }}>
                {i.title}
                {!i.public && (
                  <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.6 }}>
                    [internal]
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{i.status}</span>
              <span style={{ fontSize: 11, opacity: 0.5 }}>
                {new Date(i.started_at).toISOString().slice(0, 10)}
              </span>
              <span style={{ opacity: 0.5 }}>{expanded === i.id ? "▾" : "▸"}</span>
            </div>
            {expanded === i.id && (
              <IncidentDetail
                incident={i}
                updates={updatesById[i.id] ?? []}
                onPatch={(patch) => patchIncident(i.id, patch)}
                onPost={(body) => postUpdate(i.id, body)}
              />
            )}
          </div>
        ))}
        {incidents.length === 0 && (
          <div style={emptyStyle}>No incidents yet.</div>
        )}
      </div>
    </div>
  );
}

function IncidentDetail({
  incident,
  updates,
  onPatch,
  onPost,
}: {
  incident: Incident;
  updates: Update[];
  onPatch: (patch: Partial<Incident>) => void | Promise<void>;
  onPost: (body: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div style={{ borderTop: "1px solid #1f2630", padding: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 11, opacity: 0.6 }}>status</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => onPatch({ status: s })}
            style={{
              ...buttonStyle,
              padding: "2px 8px",
              fontSize: 11,
              background: incident.status === s ? "#1f2630" : "transparent",
            }}
          >
            {s}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => onPatch({ public: !incident.public })}
          style={buttonStyle}
        >
          {incident.public ? "Make internal" : "Make public"}
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <textarea
          placeholder="Post update…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ ...inputStyle, minHeight: 60 }}
        />
        <button
          onClick={() => {
            void onPost(draft);
            setDraft("");
          }}
          style={{ ...primaryButtonStyle, marginTop: 6 }}
        >
          Post
        </button>
      </div>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          borderLeft: "2px solid #1f2630",
          paddingLeft: 12,
        }}
      >
        {updates.map((u) => (
          <li key={u.id} style={{ fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2 }}>
              {new Date(u.posted_at).toISOString().replace("T", " ").slice(0, 19)}
            </div>
            {u.body}
          </li>
        ))}
        {updates.length === 0 && (
          <li style={{ fontSize: 12, opacity: 0.5 }}>No updates yet.</li>
        )}
      </ul>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Incident["severity"] }) {
  const color =
    severity === "critical"
      ? "#fca5a5"
      : severity === "major"
        ? "#fdba74"
        : "#fde68a";
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: 1,
        padding: "2px 8px",
        borderRadius: 4,
        background: "#0b0d10",
        color,
        border: `1px solid ${color}`,
        textTransform: "uppercase",
      }}
    >
      {severity}
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

const errorStyle: React.CSSProperties = {
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
