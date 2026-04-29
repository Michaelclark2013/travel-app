// app/admin/metrics/page.tsx — Track 4 metrics dashboard.
//
// Server-rendered. Each card is its own async server component wrapped in a
// <Suspense> boundary so a slow Supabase RPC for one card doesn't block the
// others. The realtime "users now" panel and the cohort drill-down are
// client components mounted as siblings.
//
// Data flow:
//   Page (server) ──► (renders shell + suspense fallbacks instantly)
//        │
//        ├── DauWauMauCard (server, async)        – Sparklines × 3
//        ├── RetentionCard (server, async)        – Triangle
//        ├── FunnelCard    (server, async)        – Bars
//        ├── GeoCard       (server, async)        – Bars
//        ├── DeviceCard    (server, async)        – Bars
//        ├── ConcurrentCard(server, async wrapping a client subtree)
//        └── CustomCardsRow(server, async)        – Saved metric_cards
//
// We deliberately do NOT call cookies()/headers() at the top level so the
// shell can prerender; each card resolves dynamic data inside its own
// boundary (see node_modules/next/dist/docs/01-app/02-guides/streaming.md).

import { Suspense } from "react";
import Link from "next/link";
import {
  fetchConcurrent,
  fetchCustomMetric,
  fetchDauWauMau,
  fetchDeviceSplit,
  fetchFunnel,
  fetchGeoSplit,
  fetchRetentionCohort,
  listMetricCards,
  DEFAULT_FUNNEL_STEPS,
} from "@/lib/admin/metrics-data";
import {
  Bars,
  BigNumber,
  Card,
  CohortTriangle,
  FunnelChart,
  Sparkline,
} from "./_components/Charts";
import { ConcurrentPanel } from "./_components/ConcurrentPanel";
import { CohortDrilldown } from "./_components/CohortDrilldown";
import { posthogServerEnabled } from "@/lib/admin/posthog-server";

// Each Suspense boundary needs to read live data, so opt out of the
// prerender cache for this route.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---------------------------------------------------------------------------
// Page shell — paints instantly, every card streams in independently.
// ---------------------------------------------------------------------------
export default function MetricsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.6,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Metrics
          </div>
          <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
            Voyage analytics
          </h1>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
            Server-rendered dashboard. Each card streams independently;
            PostHog data is cached 60s in Upstash.
          </p>
        </div>
        <Link
          href="/admin/metrics/builder"
          style={{
            color: "#7dd3fc",
            fontSize: 12,
            textDecoration: "underline",
          }}
        >
          + Build a custom metric
        </Link>
      </header>

      {!posthogServerEnabled() && (
        <div
          role="note"
          style={{
            background: "#1a1408",
            border: "1px solid #4a3a17",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            color: "#fbbf24",
          }}
        >
          PostHog server-side is not configured. Set{" "}
          <code>POSTHOG_PERSONAL_API_KEY</code> and{" "}
          <code>POSTHOG_PROJECT_ID</code> to enable PostHog-backed cards.
        </div>
      )}

      {/* Top row — DAU/WAU/MAU sparklines + concurrent live panel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        <Suspense fallback={<CardSkeleton title="DAU / WAU / MAU" />}>
          <DauWauMauCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton title="Concurrent now" />}>
          <ConcurrentCard />
        </Suspense>
      </div>

      {/* Retention */}
      <Suspense fallback={<CardSkeleton title="Retention cohorts" />}>
        <RetentionCard />
      </Suspense>

      {/* Funnel */}
      <Suspense fallback={<CardSkeleton title="Funnel" />}>
        <FunnelCard />
      </Suspense>

      {/* Geo + Device side by side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        <Suspense fallback={<CardSkeleton title="Geo split" />}>
          <GeoCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton title="Device split" />}>
          <DeviceCard />
        </Suspense>
      </div>

      {/* Saved custom metric cards */}
      <Suspense fallback={<CardSkeleton title="Saved cards" />}>
        <CustomCardsRow />
      </Suspense>

      {/* Drill-down side panel — listens to ?cohort=&day= in the URL. */}
      <CohortDrilldown />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card components — each one is async and runs its own RPC.
// ---------------------------------------------------------------------------

async function DauWauMauCard() {
  const rows = await fetchDauWauMau(28);
  const dau = rows.map((r) => r.dau);
  const wau = rows.map((r) => r.wau);
  const mau = rows.map((r) => r.mau);
  return (
    <Card title="DAU / WAU / MAU" hint="trailing 28 days">
      <Sparkline values={dau} label="DAU" color="#7dd3fc" />
      <Sparkline values={wau} label="WAU" color="#a78bfa" />
      <Sparkline values={mau} label="MAU" color="#fbbf24" />
    </Card>
  );
}

async function ConcurrentCard() {
  const initial = await fetchConcurrent(5);
  return (
    <Card title="Concurrent now" hint="last 5 min">
      <ConcurrentPanel initial={initial} windowMinutes={5} />
    </Card>
  );
}

async function RetentionCard() {
  const rows = await fetchRetentionCohort();
  return (
    <Card title="Retention cohorts" hint="last 12 weeks · click cell to drill">
      <CohortTriangle
        rows={rows}
        cellHref={(week, day) =>
          `/admin/metrics?cohort=${encodeURIComponent(
            week.slice(0, 10)
          )}&day=${day}`
        }
      />
    </Card>
  );
}

async function FunnelCard() {
  const rows = await fetchFunnel(DEFAULT_FUNNEL_STEPS);
  return (
    <Card
      title="Funnel"
      hint="signup → first trip → first moment → follow → DM → 7d return"
    >
      <FunnelChart steps={rows} />
    </Card>
  );
}

async function GeoCard() {
  const rows = await fetchGeoSplit();
  return (
    <Card title="Geo split" hint="last 30 days, top 50 countries">
      <Bars
        data={rows.slice(0, 12).map((r) => ({
          label: r.country,
          value: r.users,
        }))}
      />
    </Card>
  );
}

async function DeviceCard() {
  const rows = await fetchDeviceSplit();
  return (
    <Card title="Device split" hint="last 30 days">
      <Bars
        data={rows.map((r) => ({
          label: r.device,
          value: r.users,
        }))}
      />
    </Card>
  );
}

async function CustomCardsRow() {
  const cards = await listMetricCards();
  if (!cards.length) {
    return (
      <Card title="Saved cards" hint="custom metric builder">
        <p style={{ fontSize: 12, color: "#94a3b8" }}>
          No saved cards yet —{" "}
          <Link href="/admin/metrics/builder" style={{ color: "#7dd3fc" }}>
            build one
          </Link>
          .
        </p>
      </Card>
    );
  }

  // Render each card in its own boundary so a slow custom query doesn't gate
  // the rest. We collect <Suspense> children rather than awaiting in a loop.
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
      }}
    >
      {cards.map((c) => (
        <Suspense key={c.id} fallback={<CardSkeleton title={c.name} />}>
          <SavedCard cardId={c.id} name={c.name} />
        </Suspense>
      ))}
    </div>
  );
}

async function SavedCard({ cardId, name }: { cardId: string; name: string }) {
  const row = await fetchCustomMetric(cardId);
  return (
    <Card title={name} hint={`#${cardId}`}>
      {row ? (
        <BigNumber value={row.value} />
      ) : (
        <p style={{ color: "#94a3b8", fontSize: 12 }}>No data.</p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — what each Suspense fallback renders while the RPC resolves.
// ---------------------------------------------------------------------------
function CardSkeleton({ title }: { title: string }) {
  return (
    <section
      style={{
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 8,
        padding: 16,
        minHeight: 100,
      }}
    >
      <header
        style={{
          fontSize: 12,
          letterSpacing: 1,
          opacity: 0.5,
          textTransform: "uppercase",
        }}
      >
        {title}
      </header>
      <div
        style={{
          marginTop: 12,
          height: 50,
          background:
            "linear-gradient(90deg, #1a2030 0%, #232a3a 50%, #1a2030 100%)",
          backgroundSize: "200% 100%",
          animation: "voyageMetricsShimmer 1.5s ease-in-out infinite",
          borderRadius: 4,
          opacity: 0.4,
        }}
      />
    </section>
  );
}
