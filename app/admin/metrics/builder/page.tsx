// app/admin/metrics/builder/page.tsx — Track 4 custom-metric builder.
//
// Server component shell + a single client form. Submit POSTs to
// /api/admin/metrics/cards which validates and calls audit() before
// persisting to the metric_cards table.

import Link from "next/link";
import { listMetricCards } from "@/lib/admin/metrics-data";
import { BuilderForm } from "./BuilderForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MetricBuilderPage() {
  const cards = await listMetricCards();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <div
          style={{
            fontSize: 12,
            opacity: 0.6,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Metrics / Builder
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Custom metric builder
        </h1>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
          Compose a parameterized RPC call against a whitelisted base table
          and save it as a card on the dashboard.
          <Link
            href="/admin/metrics"
            style={{
              marginLeft: 8,
              color: "#7dd3fc",
              textDecoration: "underline",
            }}
          >
            ← back to metrics
          </Link>
        </p>
      </header>

      <BuilderForm />

      <section
        style={{
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
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
          Saved cards ({cards.length})
        </h2>
        {cards.length === 0 ? (
          <p style={{ fontSize: 12, color: "#94a3b8" }}>
            No cards yet. Build one above.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 12,
            }}
          >
            {cards.map((c) => (
              <li
                key={c.id}
                style={{
                  background: "#0b0d10",
                  border: "1px solid #1f2630",
                  borderRadius: 4,
                  padding: "8px 10px",
                  display: "flex",
                  gap: 12,
                }}
              >
                <strong style={{ color: "#e6e8eb" }}>{c.name}</strong>
                <code
                  style={{ color: "#94a3b8", fontSize: 11 }}
                  title={JSON.stringify(c.config)}
                >
                  {c.config.agg}
                  {c.config.column ? `(${c.config.column})` : "(*)"} from{" "}
                  {c.config.table}
                </code>
                <span
                  style={{
                    marginLeft: "auto",
                    color: "#64748b",
                    fontSize: 11,
                  }}
                >
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
