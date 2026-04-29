"use client";

// app/admin/inbox/macros/page.tsx — Track 7 canned-replies CRUD.

import { useEffect, useState } from "react";

type Macro = {
  id: string;
  name: string;
  body: string;
  created_by: string | null;
  created_at: string;
};

export default function MacrosPage() {
  const [rows, setRows] = useState<Macro[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/support/macros", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setRows(data.rows ?? []);
    else setError(data.error ?? `Failed (${res.status})`);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const url = editing ? `/api/admin/support/macros/${editing}` : "/api/admin/support/macros";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setName("");
      setText("");
      setEditing(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this macro?")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/support/macros/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(m: Macro) {
    setEditing(m.id);
    setName(m.name);
    setText(m.body);
  }

  function cancelEdit() {
    setEditing(null);
    setName("");
    setText("");
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>MACROS</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Canned replies
        </h1>
      </header>

      <section
        style={{
          padding: 12,
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          {editing ? `Editing ${editing}` : "New macro"}
        </div>
        <input
          placeholder="Name (e.g. refund-approved)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
        />
        <textarea
          placeholder="Body — supports {{name}} replacement on insert."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          style={{ ...inputStyle, width: "100%", minHeight: 120, resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={() => void save()}
            disabled={busy || !name.trim() || !text.trim()}
            style={{ ...buttonStyle, background: "#1d4ed8", borderColor: "#1d4ed8" }}
          >
            {editing ? "Update" : "Create"}
          </button>
          {editing && (
            <button onClick={cancelEdit} style={buttonStyle}>
              Cancel
            </button>
          )}
        </div>
        {error && <div style={{ ...errorStyle, marginTop: 8 }}>{error}</div>}
      </section>

      <section
        style={{
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
        }}
      >
        {rows.map((m) => (
          <div
            key={m.id}
            style={{
              padding: 12,
              borderTop: "1px solid #1f2630",
              display: "flex",
              gap: 12,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.75,
                  whiteSpace: "pre-wrap",
                  marginTop: 4,
                }}
              >
                {m.body}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={() => startEdit(m)} style={buttonStyle}>
                Edit
              </button>
              <button
                onClick={() => void remove(m.id)}
                style={{ ...buttonStyle, color: "#fca5a5" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: 24, opacity: 0.5, fontSize: 13, textAlign: "center" }}>
            No macros yet. Create one above.
          </div>
        )}
      </section>
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

const errorStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#3a1f25",
  border: "1px solid #6b2d35",
  borderRadius: 6,
  fontSize: 13,
};
