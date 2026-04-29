"use client";

// app/admin/search/page.tsx — Track 9 natural-language admin search.
//
// WHAT
//   A single search bar that submits to /api/admin/search/semantic and
//   renders ranked hits with kind, score, snippet, and a deep link into
//   /admin/users/[id] (or /m, /trips for content links).
//
// WHY a client component
//   The search is interactive (debounced submit, loading state, kind filter
//   chips, kbd shortcut). The endpoint enforces users.read server-side.
//
// ENV VARS
//   None directly.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const KINDS = [
  { id: "moments", label: "Moments" },
  { id: "trips", label: "Trips" },
  { id: "comments", label: "Comments" },
] as const;

type Hit = {
  kind: string;
  id: string;
  score: number;
  excerpt: string;
  snippet: string;
  link: string;
};

export default function AdminSearchPage() {
  const [q, setQ] = useState("");
  const [activeKinds, setActiveKinds] = useState<Set<string>>(
    new Set(["moments", "trips", "comments"])
  );
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function toggleKind(id: string) {
    const next = new Set(activeKinds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setActiveKinds(next);
  }

  async function run() {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: q.trim(),
        kinds: Array.from(activeKinds).join(","),
        limit: "30",
      });
      const res = await fetch(`/api/admin/search/semantic?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Search failed (${res.status})`);
      }
      const data = await res.json();
      setHits(data.hits ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run();
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          AI SEARCH
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Semantic Search
        </h1>
        <p style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
          Natural language search over moments, trips, and comments via pgvector.
        </p>
      </header>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Try "users complaining about delayed flights"'
          style={{
            flex: 1,
            padding: "10px 12px",
            background: "#11151a",
            border: "1px solid #2a3340",
            borderRadius: 8,
            color: "#e6e8eb",
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 18px",
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            cursor: loading ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {KINDS.map((k) => {
          const on = activeKinds.has(k.id);
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => toggleKind(k.id)}
              style={{
                padding: "4px 10px",
                background: on ? "#1f2630" : "transparent",
                border: `1px solid ${on ? "#3b4654" : "#2a3340"}`,
                color: on ? "#e6e8eb" : "#9ba3ad",
                borderRadius: 999,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "#3b1d1d",
            border: "1px solid #6b2a2a",
            color: "#ffb4b4",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {hits === null ? (
        <div style={{ marginTop: 24, opacity: 0.6, fontSize: 13 }}>
          Enter a query and hit Search. Results rank by cosine similarity.
        </div>
      ) : hits.length === 0 ? (
        <div style={{ marginTop: 24, opacity: 0.6, fontSize: 13 }}>
          No matches{q ? ` for “${q}”` : ""}.
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
          {hits.map((h, i) => (
            <li
              key={`${h.kind}-${h.id}-${i}`}
              style={{
                padding: "12px 14px",
                marginBottom: 8,
                background: "#11151a",
                border: "1px solid #1f2630",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 10,
                      letterSpacing: 1,
                      padding: "2px 6px",
                      background: "#1f2630",
                      borderRadius: 4,
                      textTransform: "uppercase",
                    }}
                  >
                    {h.kind}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.55 }}>
                    score {(h.score ?? 0).toFixed(3)}
                  </span>
                </div>
                {h.link ? (
                  <Link
                    href={h.link}
                    style={{ color: "#93c5fd", fontSize: 12, textDecoration: "none" }}
                  >
                    Open →
                  </Link>
                ) : null}
              </div>
              <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>
                {h.snippet || h.excerpt || (
                  <span style={{ opacity: 0.4 }}>(no snippet)</span>
                )}
              </div>
              <div style={{ fontSize: 10, opacity: 0.4, marginTop: 6 }}>
                id: {h.id}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
