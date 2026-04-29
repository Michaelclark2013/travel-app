"use client";

// app/admin/billing/page.tsx — Track 5 subscription dashboard.
//
// WHAT
//   Tabs (Active / Past Due / Canceled / Comps) over pro_entitlements,
//   search by email or stripe_customer_id, top metric strip (MRR / ARR /
//   counts), and a dunning queue table.
//
// AUTH
//   /admin/billing routes are gated by AdminShell.RequirePerm("billing.read")
//   client-side AND every API call re-checks server-side via requirePerm().
//
// ENV VARS
//   None directly — APIs read STRIPE_SECRET_KEY and Supabase env.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Tab = "active" | "past_due" | "canceled" | "comps";

type Row = {
  user_id: string;
  source: "stripe" | "comp" | "manual";
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  granted_by: string | null;
  granted_at: string;
  updated_at: string;
};

type Metrics = {
  mrr: number;
  arr: number;
  ndr: number | null;
  grossChurn: number | null;
  counts: { active: number; past_due: number; canceled: number; comps: number };
  pricing: { monthlyUsd: number; annualUsd: number };
  dunning: Array<{
    user_id: string;
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string | null;
    stripe_customer_id: string | null;
  }>;
};

const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "past_due", label: "Past due" },
  { key: "canceled", label: "Canceled" },
  { key: "comps", label: "Comps" },
];

export default function BillingPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadList() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ tab });
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(`/api/admin/billing/list?${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setRows([]);
      } else {
        setRows(data.rows ?? []);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMetrics() {
    try {
      const res = await fetch("/api/admin/billing/metrics", {
        credentials: "include",
      });
      if (res.ok) setMetrics(await res.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    void loadMetrics();
  }, []);

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>BILLING</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Subscriptions & revenue
        </h1>
      </header>

      <MetricsStrip metrics={metrics} />

      <DunningQueue rows={metrics?.dunning ?? []} />

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 24,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = metrics?.counts?.[t.key] ?? 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                ...buttonStyle,
                background: active ? "#1f2630" : "transparent",
                borderColor: active ? "#3b4654" : "#2a3340",
              }}
            >
              {t.label}{" "}
              <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <input
          placeholder="email or cus_..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void loadList();
          }}
          style={inputStyle}
        />
        <button onClick={loadList} style={buttonStyle}>
          Search
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      <SubsTable rows={rows} loading={loading} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metrics strip
// ---------------------------------------------------------------------------
function MetricsStrip({ metrics }: { metrics: Metrics | null }) {
  const items = useMemo(() => {
    return [
      { k: "MRR", v: metrics ? `$${metrics.mrr.toLocaleString()}` : "—" },
      { k: "ARR", v: metrics ? `$${metrics.arr.toLocaleString()}` : "—" },
      {
        k: "NDR",
        v: metrics?.ndr != null ? `${(metrics.ndr * 100).toFixed(1)}%` : "—",
      },
      {
        k: "Gross churn",
        v:
          metrics?.grossChurn != null
            ? `${(metrics.grossChurn * 100).toFixed(1)}%`
            : "—",
      },
      { k: "Active", v: metrics ? metrics.counts.active : "—" },
      { k: "Past due", v: metrics ? metrics.counts.past_due : "—" },
      { k: "Canceled", v: metrics ? metrics.counts.canceled : "—" },
      { k: "Comps", v: metrics ? metrics.counts.comps : "—" },
    ];
  }, [metrics]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 8,
        marginBottom: 12,
      }}
    >
      {items.map((i) => (
        <div
          key={i.k}
          style={{
            background: "#11151a",
            border: "1px solid #1f2630",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1 }}>
            {i.k.toUpperCase()}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>
            {String(i.v)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dunning queue
// ---------------------------------------------------------------------------
function DunningQueue({ rows }: { rows: Metrics["dunning"] }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 11,
          opacity: 0.7,
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        DUNNING QUEUE
      </div>
      <div
        style={{
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#0e1217", opacity: 0.7 }}>
              <th style={th}>Customer</th>
              <th style={th}>Status</th>
              <th style={th}>Cancel at end</th>
              <th style={th}>Period end</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.user_id}
                style={{ borderTop: "1px solid #1f2630" }}
              >
                <td style={td}>{r.stripe_customer_id ?? r.user_id.slice(0, 8)}</td>
                <td style={td}>
                  <code style={{ color: "#fca5a5" }}>{r.status}</code>
                </td>
                <td style={td}>{r.cancel_at_period_end ? "yes" : "no"}</td>
                <td style={td}>
                  {r.current_period_end
                    ? new Date(r.current_period_end).toISOString().slice(0, 10)
                    : "—"}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <Link
                    href={`/admin/billing/${r.stripe_customer_id ?? r.user_id}`}
                    style={{ color: "#93c5fd", textDecoration: "none" }}
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main subs table
// ---------------------------------------------------------------------------
function SubsTable({ rows, loading }: { rows: Row[]; loading: boolean }) {
  return (
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
            <th style={th}>User</th>
            <th style={th}>Source</th>
            <th style={th}>Status</th>
            <th style={th}>Period end</th>
            <th style={th}>Customer</th>
            <th style={th}>Updated</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.user_id}
              style={{ borderTop: "1px solid #1f2630", fontSize: 12 }}
            >
              <td style={td}>{r.user_id.slice(0, 8)}</td>
              <td style={td}>
                <code style={{ color: "#86efac" }}>{r.source}</code>
              </td>
              <td style={td}>
                <code style={{ color: "#93c5fd" }}>{r.status}</code>
                {r.cancel_at_period_end && (
                  <span style={{ marginLeft: 6, opacity: 0.6 }}>(cancelling)</span>
                )}
              </td>
              <td style={td}>
                {r.current_period_end
                  ? new Date(r.current_period_end).toISOString().slice(0, 10)
                  : "—"}
              </td>
              <td style={{ ...td, fontFamily: "inherit" }}>
                {r.stripe_customer_id ?? "—"}
              </td>
              <td style={td}>
                {new Date(r.updated_at).toISOString().slice(0, 19).replace("T", " ")}
              </td>
              <td style={{ ...td, textAlign: "right" }}>
                <Link
                  href={`/admin/billing/${r.stripe_customer_id ?? r.user_id}`}
                  style={{ color: "#93c5fd", textDecoration: "none" }}
                >
                  Open →
                </Link>
              </td>
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...td, textAlign: "center", opacity: 0.5 }}>
                No subscriptions match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
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
      {message}
    </div>
  );
}

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

const inputStyle: React.CSSProperties = {
  background: "#0b0d10",
  border: "1px solid #2a3340",
  color: "#e6e8eb",
  padding: "6px 8px",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 12,
  minWidth: 220,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 500,
};

const td: React.CSSProperties = {
  padding: "8px 12px",
  verticalAlign: "top",
};
