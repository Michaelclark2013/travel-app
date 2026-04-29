"use client";

// app/admin/metrics/_components/CohortDrilldown.tsx — Track 4 cohort
// drill-down side panel. Reads ?cohort=YYYY-MM-DD&day=d1|d7|d30 off the
// URL and shows the user IDs in that cell, with a deeplink to
// /admin/users?ids=...
//
// We keep this client-only so we don't need a route param page; the cohort
// triangle just rewrites the query string, and this listens.

import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type DrilldownPayload = {
  cohort_week: string;
  day: "d1" | "d7" | "d30";
  user_ids: string[];
};

export function CohortDrilldown() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const cohort = params.get("cohort");
  const day = (params.get("day") ?? "d1") as "d1" | "d7" | "d30";

  const [payload, setPayload] = useState<DrilldownPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!cohort) {
      // Reset only if there's something to reset — keeps the effect from
      // triggering an extra render when the panel is already closed.
      setPayload((p) => (p === null ? p : null));
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    void fetch(
      `/api/admin/metrics/cohort?week=${encodeURIComponent(
        cohort
      )}&day=${encodeURIComponent(day)}`,
      { cache: "no-store" }
    )
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setPayload(null);
          return;
        }
        const j = (await r.json()) as DrilldownPayload;
        setPayload(j);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cohort, day]);

  if (!cohort) return null;

  const ids = payload?.user_ids ?? [];

  return (
    <aside
      role="dialog"
      aria-label={`Cohort ${cohort} ${day} users`}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(420px, 100vw)",
        background: "#0b0d10",
        borderLeft: "1px solid #1f2630",
        zIndex: 50,
        overflowY: "auto",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: "#e6e8eb" }}>
          Cohort {cohort} · {day.toUpperCase()}
        </h3>
        <button
          type="button"
          onClick={() => router.replace(pathname, { scroll: false })}
          aria-label="Close drill-down"
          style={{
            marginLeft: "auto",
            background: "transparent",
            color: "#94a3b8",
            border: "1px solid #1f2630",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Close
        </button>
      </header>

      {loading ? (
        <p style={{ color: "#94a3b8", fontSize: 12 }}>Loading…</p>
      ) : ids.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 12 }}>No users in this cell.</p>
      ) : (
        <>
          <Link
            href={`/admin/users?ids=${ids.slice(0, 100).join(",")}`}
            style={{
              fontSize: 12,
              color: "#7dd3fc",
              textDecoration: "underline",
            }}
          >
            Open {ids.length} user{ids.length === 1 ? "" : "s"} in /admin/users
            →
          </Link>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 11,
              color: "#cbd5e1",
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace',
            }}
          >
            {ids.slice(0, 200).map((u) => (
              <li
                key={u}
                style={{
                  padding: "4px 6px",
                  background: "#11151a",
                  border: "1px solid #1f2630",
                  borderRadius: 3,
                }}
              >
                {u}
              </li>
            ))}
            {ids.length > 200 ? (
              <li style={{ color: "#64748b", padding: "4px 6px" }}>
                + {ids.length - 200} more (use the deeplink above)
              </li>
            ) : null}
          </ul>
        </>
      )}
    </aside>
  );
}
