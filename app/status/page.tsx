// app/status/page.tsx — Track 6 PUBLIC status page.
//
// WHAT
//   Lists current open incidents and resolved incidents in the last 30 days.
//   No auth gate; this page MUST stay accessible during a maintenance lockout
//   (the maintenance gate in middleware.ts exempts /status).
//
// WHY a server component
//   Renders synchronously from Supabase (service-role read of public=true
//   rows) so the page is fast and indexable. No client interactivity needed.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY — to bypass RLS for the unauthenticated read.

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const metadata = {
  title: "Voyage — Status",
  description: "Operational status and incident history for Voyage.",
};

export const revalidate = 30; // 30s ISR

type Incident = {
  id: string;
  title: string;
  severity: "minor" | "major" | "critical";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  started_at: string;
  resolved_at: string | null;
};

type IncidentUpdate = {
  id: number;
  incident_id: string;
  body: string;
  posted_at: string;
};

const SEVERITY_COLOR: Record<Incident["severity"], string> = {
  minor: "#fde68a",
  major: "#fdba74",
  critical: "#fca5a5",
};

const SEVERITY_BG: Record<Incident["severity"], string> = {
  minor: "rgba(253, 230, 138, 0.1)",
  major: "rgba(253, 186, 116, 0.12)",
  critical: "rgba(252, 165, 165, 0.14)",
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function loadIncidents(): Promise<{
  current: Incident[];
  recent: Incident[];
  updatesByIncident: Record<string, IncidentUpdate[]>;
}> {
  const supa = getSupabaseAdmin();
  if (!supa) {
    return { current: [], recent: [], updatesByIncident: {} };
  }
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const [{ data: incidents }, { data: updates }] = await Promise.all([
    supa
      .from("incidents")
      .select("id,title,severity,status,started_at,resolved_at")
      .eq("public", true)
      .gte("started_at", cutoff)
      .order("started_at", { ascending: false }),
    supa
      .from("incident_updates")
      .select("id,incident_id,body,posted_at")
      .order("posted_at", { ascending: false })
      .limit(500),
  ]);
  const all = (incidents ?? []) as Incident[];
  const updatesByIncident: Record<string, IncidentUpdate[]> = {};
  for (const u of (updates ?? []) as IncidentUpdate[]) {
    (updatesByIncident[u.incident_id] ??= []).push(u);
  }
  return {
    current: all.filter((i) => i.status !== "resolved"),
    recent: all.filter((i) => i.status === "resolved"),
    updatesByIncident,
  };
}

export default async function StatusPage() {
  const { current, recent, updatesByIncident } = await loadIncidents();
  const overall = current.length === 0 ? "ok" : "incident";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0d10",
        color: "#e6e8eb",
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace',
        padding: "48px 20px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <header style={{ marginBottom: 32 }}>
          <Link
            href="/"
            style={{ color: "#93c5fd", textDecoration: "none", fontSize: 13 }}
          >
            ← Voyage
          </Link>
          <h1
            style={{
              fontSize: 32,
              margin: "8px 0 12px",
              fontWeight: 600,
              letterSpacing: -0.5,
            }}
          >
            Voyage Status
          </h1>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px",
              borderRadius: 999,
              background:
                overall === "ok"
                  ? "rgba(74, 222, 128, 0.12)"
                  : "rgba(252, 165, 165, 0.14)",
              border: `1px solid ${
                overall === "ok" ? "#4ade80" : "#fca5a5"
              }`,
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: overall === "ok" ? "#4ade80" : "#fca5a5",
              }}
            />
            {overall === "ok"
              ? "All systems operational"
              : `${current.length} active incident${current.length === 1 ? "" : "s"}`}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, opacity: 0.6 }}>
            Subscribe:{" "}
            <Link href="/api/status.rss" style={{ color: "#93c5fd" }}>
              RSS
            </Link>{" "}
            ·{" "}
            <Link href="/api/status.json" style={{ color: "#93c5fd" }}>
              JSON
            </Link>
          </div>
        </header>

        {current.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2
              style={{
                fontSize: 12,
                opacity: 0.6,
                letterSpacing: 1,
                margin: "0 0 12px",
                fontWeight: 500,
              }}
            >
              ACTIVE
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {current.map((i) => (
                <IncidentCard
                  key={i.id}
                  incident={i}
                  updates={updatesByIncident[i.id] ?? []}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2
            style={{
              fontSize: 12,
              opacity: 0.6,
              letterSpacing: 1,
              margin: "0 0 12px",
              fontWeight: 500,
            }}
          >
            LAST 30 DAYS
          </h2>
          {recent.length === 0 ? (
            <div
              style={{
                padding: 16,
                background: "#11151a",
                border: "1px dashed #1f2630",
                borderRadius: 8,
                fontSize: 13,
                opacity: 0.7,
              }}
            >
              No resolved incidents in the last 30 days.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {recent.map((i) => (
                <IncidentCard
                  key={i.id}
                  incident={i}
                  updates={updatesByIncident[i.id] ?? []}
                />
              ))}
            </div>
          )}
        </section>

        <footer
          style={{
            marginTop: 60,
            paddingTop: 20,
            borderTop: "1px solid #1f2630",
            fontSize: 11,
            opacity: 0.5,
          }}
        >
          Updated {new Date().toISOString().replace("T", " ").slice(0, 19)} UTC
        </footer>
      </div>
    </main>
  );
}

function IncidentCard({
  incident,
  updates,
}: {
  incident: Incident;
  updates: IncidentUpdate[];
}) {
  return (
    <article
      id={incident.id}
      style={{
        padding: 16,
        background: SEVERITY_BG[incident.severity],
        border: `1px solid ${SEVERITY_COLOR[incident.severity]}`,
        borderRadius: 8,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: 1,
            padding: "2px 8px",
            borderRadius: 4,
            background: "#0b0d10",
            color: SEVERITY_COLOR[incident.severity],
            border: `1px solid ${SEVERITY_COLOR[incident.severity]}`,
            textTransform: "uppercase",
          }}
        >
          {incident.severity}
        </span>
        <span style={{ fontWeight: 600, flex: 1, fontSize: 15 }}>
          {incident.title}
        </span>
        <span style={{ fontSize: 11, opacity: 0.7 }}>
          {incident.status}
        </span>
      </header>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: updates.length ? 12 : 0 }}>
        Started {new Date(incident.started_at).toISOString().replace("T", " ").slice(0, 19)}
        {incident.resolved_at && (
          <>
            {" · Resolved "}
            {new Date(incident.resolved_at).toISOString().replace("T", " ").slice(0, 19)}
          </>
        )}
      </div>
      {updates.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
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
              <div>{u.body}</div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
