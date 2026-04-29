// app/admin/metrics/_components/Charts.tsx — Track 4 zero-deps SVG charts.
//
// We hand-roll Sparkline / Bars / Line / Number rather than pull in a chart
// library. At dashboard scale this is a few hundred lines of math and keeps
// the bundle under control.
//
// All exports are server-component-safe (no "use client" directive — no
// hooks, no event handlers). The cohort triangle exposes a click hook via a
// prop the consumer wraps in its own client component.

import type { ReactNode } from "react";

const FG = "#7dd3fc";
const FG_ALT = "#fbbf24";
const FG_DIM = "#475569";
const TEXT = "#e6e8eb";
const TEXT_DIM = "#94a3b8";
const PANEL_BG = "#11151a";
const PANEL_BORDER = "#1f2630";

// ---------------------------------------------------------------------------
// Card — shared chrome for every metric panel.
// ---------------------------------------------------------------------------
export function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: PANEL_BG,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 8,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h2
          style={{
            fontSize: 12,
            margin: 0,
            letterSpacing: 1,
            opacity: 0.75,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
        {hint ? (
          <span style={{ fontSize: 11, color: TEXT_DIM }}>{hint}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — fixed-height line chart of a single metric.
// ---------------------------------------------------------------------------
export function Sparkline({
  values,
  width = 320,
  height = 60,
  color = FG,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}) {
  if (!values.length) {
    return <EmptySvg width={width} height={height} message="no data" />;
  }
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const dx = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => {
      const x = i * dx;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = values[values.length - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {label ? (
          <span style={{ fontSize: 11, color: TEXT_DIM }}>{label}</span>
        ) : null}
        <span
          style={{
            fontSize: 18,
            color: TEXT,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {last.toLocaleString()}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <line
          x1={0}
          x2={width}
          y1={height - 0.5}
          y2={height - 0.5}
          stroke={FG_DIM}
          strokeWidth={0.5}
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bars — horizontal bar chart for geo / device / funnel.
// ---------------------------------------------------------------------------
export function Bars({
  data,
  formatValue,
  max,
  height = 22,
}: {
  data: { label: string; value: number; sublabel?: string }[];
  formatValue?: (v: number) => string;
  max?: number;
  height?: number;
}) {
  if (!data.length) {
    return <p style={{ color: TEXT_DIM, fontSize: 12 }}>No data.</p>;
  }
  const peak = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d) => {
        const pct = peak === 0 ? 0 : (d.value / peak) * 100;
        return (
          <div
            key={d.label}
            style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr 60px",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            <span
              style={{
                color: TEXT,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={d.label}
            >
              {d.label}
            </span>
            <div
              style={{
                position: "relative",
                background: "#0b0d10",
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 3,
                height,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  background: FG,
                  opacity: 0.65,
                  borderRadius: 2,
                }}
              />
              {d.sublabel ? (
                <span
                  style={{
                    position: "absolute",
                    left: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: TEXT_DIM,
                    fontSize: 11,
                  }}
                >
                  {d.sublabel}
                </span>
              ) : null}
            </div>
            <span
              style={{
                color: TEXT,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatValue ? formatValue(d.value) : d.value.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CohortTriangle — last 12 weeks rows × {D1, D7, D30} columns, color-coded.
//
// `onCellHref(weekIso, day)` returns a URL to navigate to when a cell is
// clicked. Server-rendered as <a> tags so it's still keyboard accessible
// without any JS bundle of our own.
// ---------------------------------------------------------------------------
export function CohortTriangle({
  rows,
  cellHref,
}: {
  rows: {
    cohort_week: string;
    cohort_size: number;
    d1: number;
    d7: number;
    d30: number;
  }[];
  cellHref?: (weekIso: string, day: "d1" | "d7" | "d30") => string;
}) {
  if (!rows.length) {
    return <p style={{ color: TEXT_DIM, fontSize: 12 }}>No cohorts yet.</p>;
  }
  const cell = (
    weekIso: string,
    day: "d1" | "d7" | "d30",
    pct: number
  ) => {
    const href = cellHref?.(weekIso, day);
    const bg = pctColor(pct);
    const label = pct > 0 ? `${pct.toFixed(0)}%` : "—";
    const inner = (
      <span
        style={{
          display: "block",
          padding: "6px 8px",
          background: bg,
          color: TEXT,
          textAlign: "center",
          borderRadius: 3,
          fontVariantNumeric: "tabular-nums",
          fontSize: 12,
        }}
      >
        {label}
      </span>
    );
    return href ? (
      <a
        href={href}
        style={{ textDecoration: "none" }}
        aria-label={`Cohort ${weekIso} ${day}`}
      >
        {inner}
      </a>
    ) : (
      inner
    );
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "110px 70px repeat(3, 80px)",
          gap: 4,
          minWidth: 420,
          fontSize: 12,
        }}
      >
        <span style={{ color: TEXT_DIM, padding: "6px 0" }}>Cohort</span>
        <span style={{ color: TEXT_DIM, padding: "6px 0" }}>Size</span>
        <span style={{ color: TEXT_DIM, padding: "6px 0", textAlign: "center" }}>
          D1
        </span>
        <span style={{ color: TEXT_DIM, padding: "6px 0", textAlign: "center" }}>
          D7
        </span>
        <span style={{ color: TEXT_DIM, padding: "6px 0", textAlign: "center" }}>
          D30
        </span>
        {rows.map((r) => (
          <RowFragment key={r.cohort_week}>
            <span style={{ color: TEXT, padding: "6px 0" }}>
              {fmtCohortWeek(r.cohort_week)}
            </span>
            <span
              style={{
                color: TEXT,
                padding: "6px 0",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {r.cohort_size.toLocaleString()}
            </span>
            {cell(r.cohort_week, "d1", r.d1)}
            {cell(r.cohort_week, "d7", r.d7)}
            {cell(r.cohort_week, "d30", r.d30)}
          </RowFragment>
        ))}
      </div>
    </div>
  );
}

// React doesn't accept arbitrary fragments inside grids without keys per row,
// but a Fragment works fine — this is a thin wrapper for readability.
function RowFragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function pctColor(pct: number): string {
  if (pct >= 50) return "#1e6f3a";
  if (pct >= 25) return "#3f5a1e";
  if (pct >= 10) return "#5a3a1e";
  if (pct > 0) return "#3a2030";
  return "#171b21";
}

function fmtCohortWeek(iso: string): string {
  // "2026-04-13" -> "Apr 13"
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// FunnelChart — vertical-ish bars with drop-off arrows.
// ---------------------------------------------------------------------------
export function FunnelChart({
  steps,
}: {
  steps: { step_index: number; step_name: string; user_count: number }[];
}) {
  if (!steps.length) {
    return <p style={{ color: TEXT_DIM, fontSize: 12 }}>No funnel data.</p>;
  }
  const max = Math.max(1, ...steps.map((s) => s.user_count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {steps.map((s, i) => {
        const pctOfMax = (s.user_count / max) * 100;
        const prev = i > 0 ? steps[i - 1].user_count : null;
        const conv =
          prev && prev > 0
            ? `${((s.user_count / prev) * 100).toFixed(1)}%`
            : null;
        return (
          <div
            key={s.step_name}
            style={{
              display: "grid",
              gridTemplateColumns: "150px 1fr 80px 80px",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            <span style={{ color: TEXT }}>
              {i + 1}. {s.step_name}
            </span>
            <div
              style={{
                position: "relative",
                background: "#0b0d10",
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 3,
                height: 22,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pctOfMax}%`,
                  background: FG_ALT,
                  opacity: 0.7,
                  borderRadius: 2,
                }}
              />
            </div>
            <span
              style={{
                color: TEXT,
                fontVariantNumeric: "tabular-nums",
                textAlign: "right",
              }}
            >
              {s.user_count.toLocaleString()}
            </span>
            <span
              style={{
                color: TEXT_DIM,
                fontVariantNumeric: "tabular-nums",
                textAlign: "right",
              }}
            >
              {conv ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BigNumber — compact KPI tile.
// ---------------------------------------------------------------------------
export function BigNumber({
  value,
  hint,
  unit,
}: {
  value: string | number;
  hint?: string;
  unit?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span
        style={{
          fontSize: 32,
          fontWeight: 600,
          color: TEXT,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      {unit ? (
        <span style={{ fontSize: 13, color: TEXT_DIM }}>{unit}</span>
      ) : null}
      {hint ? (
        <span style={{ fontSize: 11, color: TEXT_DIM, marginLeft: "auto" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptySvg — sized placeholder used by Sparkline when there's no data.
// ---------------------------------------------------------------------------
function EmptySvg({
  width,
  height,
  message,
}: {
  width: number;
  height: number;
  message: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="#0b0d10"
        stroke={PANEL_BORDER}
      />
      <text
        x={width / 2}
        y={height / 2}
        fill={TEXT_DIM}
        fontSize={11}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {message}
      </text>
    </svg>
  );
}

export const METRICS_PALETTE = { FG, FG_ALT, FG_DIM, TEXT, TEXT_DIM };
