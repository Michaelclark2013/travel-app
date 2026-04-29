"use client";

// app/admin/metrics/builder/BuilderForm.tsx — Track 4 client form for the
// custom-metric builder. POSTs to /api/admin/metrics/cards.

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  METRIC_BUILDER_AGGS,
  METRIC_BUILDER_CHARTS,
  METRIC_BUILDER_TABLES,
  type MetricBuilderAgg,
  type MetricBuilderChart,
  type MetricBuilderTable,
} from "@/lib/admin/metrics-data";

const FILTER_OPS = ["=", ">", "<", ">=", "<=", "<>"] as const;

const FIELD: React.CSSProperties = {
  background: "#0b0d10",
  color: "#e6e8eb",
  border: "1px solid #1f2630",
  borderRadius: 4,
  padding: "6px 10px",
  fontSize: 12,
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace',
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  color: "#94a3b8",
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

export function BuilderForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [table, setTable] = useState<MetricBuilderTable>("trips");
  const [agg, setAgg] = useState<MetricBuilderAgg>("count");
  const [column, setColumn] = useState("");
  const [chart, setChart] = useState<MetricBuilderChart>("number");
  const [filterKey, setFilterKey] = useState("");
  const [filterOp, setFilterOp] = useState<(typeof FILTER_OPS)[number]>("=");
  const [filterValue, setFilterValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        table,
        agg,
        chart,
      };
      if (agg !== "count") body.column = column;
      if (filterKey) {
        body.filter = { key: filterKey, op: filterOp, value: filterValue };
      }
      const res = await fetch("/api/admin/metrics/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? `failed (${res.status})`);
        return;
      }
      // Reset form and refresh server data so the new card appears below.
      setName("");
      setColumn("");
      setFilterKey("");
      setFilterValue("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 8,
        padding: 16,
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={LABEL} htmlFor="mb-name">
          Name
        </label>
        <input
          id="mb-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={FIELD}
          placeholder="e.g. Trips with kids"
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={LABEL} htmlFor="mb-table">
          Base table
        </label>
        <select
          id="mb-table"
          value={table}
          onChange={(e) => setTable(e.target.value as MetricBuilderTable)}
          style={FIELD}
        >
          {METRIC_BUILDER_TABLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={LABEL} htmlFor="mb-agg">
          Aggregation
        </label>
        <select
          id="mb-agg"
          value={agg}
          onChange={(e) => setAgg(e.target.value as MetricBuilderAgg)}
          style={FIELD}
        >
          {METRIC_BUILDER_AGGS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={LABEL} htmlFor="mb-column">
          Column {agg === "count" ? "(unused for count)" : "*"}
        </label>
        <input
          id="mb-column"
          value={column}
          onChange={(e) => setColumn(e.target.value)}
          style={FIELD}
          placeholder="budget"
          disabled={agg === "count"}
          required={agg !== "count"}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={LABEL} htmlFor="mb-chart">
          Chart type
        </label>
        <select
          id="mb-chart"
          value={chart}
          onChange={(e) => setChart(e.target.value as MetricBuilderChart)}
          style={FIELD}
        >
          {METRIC_BUILDER_CHARTS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          gridColumn: "1 / -1",
        }}
      >
        <label style={LABEL}>Filter (optional)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={filterKey}
            onChange={(e) => setFilterKey(e.target.value)}
            style={{ ...FIELD, flex: 1 }}
            placeholder="column key (e.g. with_kids)"
          />
          <select
            value={filterOp}
            onChange={(e) =>
              setFilterOp(e.target.value as (typeof FILTER_OPS)[number])
            }
            style={FIELD}
          >
            {FILTER_OPS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <input
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            style={{ ...FIELD, flex: 1 }}
            placeholder="value (e.g. true)"
          />
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            gridColumn: "1 / -1",
            background: "#2a1218",
            border: "1px solid #5a1f2a",
            borderRadius: 4,
            padding: "6px 10px",
            color: "#fca5a5",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
        }}
      >
        <button
          type="submit"
          disabled={submitting}
          style={{
            background: "#7dd3fc",
            color: "#0b0d10",
            border: "none",
            borderRadius: 4,
            padding: "6px 14px",
            fontSize: 12,
            cursor: submitting ? "not-allowed" : "pointer",
            fontWeight: 600,
            opacity: submitting ? 0.5 : 1,
          }}
        >
          {submitting ? "Saving…" : "Save card"}
        </button>
      </div>
    </form>
  );
}
