"use client";

// app/admin/billing/affiliates/page.tsx — Track 5 affiliate revenue dashboard.
//
// WHAT
//   Reads from /api/admin/billing/affiliates. Filterable by partner & date.
//   Renders monthly totals, payout status, exportable CSV.
//
// AUTH
//   billing.read enforced server-side.

import { useEffect, useState } from "react";
import Link from "next/link";

type Conversion = {
  id: number;
  marker: string | null;
  click_id: string | null;
  booking_id: string | null;
  partner: string;
  amount_usd: number | null;
  currency: string;
  status: string;
  occurred_at: string;
  payout_status: string;
  payout_at: string | null;
};

type Resp = {
  rows: Conversion[];
  monthly: Record<string, { gross: number; count: number }>;
  totals: { gross: number; unpaid: number; count: number };
};

export default function AffiliatesPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [partner, setPartner] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (partner) params.set("partner", partner);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    try {
      const res = await fetch(`/api/admin/billing/affiliates?${params}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadCsv() {
    const params = new URLSearchParams({ format: "csv" });
    if (partner) params.set("partner", partner);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    window.location.href = `/api/admin/billing/affiliates?${params}`;
  }

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          BILLING / AFFILIATES
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Affiliate revenue
        </h1>
      </header>

      <div style={{ marginBottom: 12 }}>
        <Link
          href="/admin/billing"
          style={{ color: "#93c5fd", fontSize: 12, textDecoration: "none" }}
        >
          ← Subscriptions
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Card label="Gross" value={data ? `$${data.totals.gross.toLocaleString()}` : "—"} />
        <Card label="Unpaid" value={data ? `$${data.totals.unpaid.toLocaleString()}` : "—"} />
        <Card label="Count" value={data ? data.totals.count.toString() : "—"} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="partner"
          value={partner}
          onChange={(e) => setPartner(e.target.value)}
          style={inputStyle}
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={inputStyle}
          title="from"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={inputStyle}
          title="to"
        />
        <button onClick={load} style={buttonStyle}>
          Apply
        </button>
        <button onClick={downloadCsv} style={buttonStyle}>
          Download CSV
        </button>
      </div>

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

      <Section title="Monthly">
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
                <th style={th}>Month</th>
                <th style={th}>Gross USD</th>
                <th style={th}>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data?.monthly ?? {})
                .sort(([a], [b]) => (a < b ? 1 : -1))
                .map(([k, v]) => (
                  <tr key={k} style={{ borderTop: "1px solid #1f2630" }}>
                    <td style={td}>{k}</td>
                    <td style={td}>${v.gross.toFixed(2)}</td>
                    <td style={td}>{v.count}</td>
                  </tr>
                ))}
              {data && Object.keys(data.monthly).length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    style={{ ...td, textAlign: "center", opacity: 0.5 }}
                  >
                    No conversions in window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Conversions">
        <div
          style={{
            background: "#11151a",
            border: "1px solid #1f2630",
            borderRadius: 8,
            overflow: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#0e1217", opacity: 0.7 }}>
                <th style={th}>When</th>
                <th style={th}>Partner</th>
                <th style={th}>Amount</th>
                <th style={th}>Status</th>
                <th style={th}>Payout</th>
                <th style={th}>Marker</th>
                <th style={th}>Booking</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #1f2630" }}>
                  <td style={td}>
                    {new Date(r.occurred_at).toISOString().slice(0, 10)}
                  </td>
                  <td style={td}>
                    <code style={{ color: "#86efac" }}>{r.partner}</code>
                  </td>
                  <td style={td}>
                    {r.amount_usd != null ? `$${Number(r.amount_usd).toFixed(2)}` : "—"}
                  </td>
                  <td style={td}>
                    <code style={{ color: "#93c5fd" }}>{r.status}</code>
                  </td>
                  <td style={td}>{r.payout_status}</td>
                  <td style={td}>{r.marker ?? "—"}</td>
                  <td style={td}>{r.booking_id ?? "—"}</td>
                </tr>
              ))}
              {!loading && data && data.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ ...td, textAlign: "center", opacity: 0.5 }}
                  >
                    No conversions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 11,
          opacity: 0.7,
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        {title.toUpperCase()}
      </div>
      {children}
    </section>
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
