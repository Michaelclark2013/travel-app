"use client";

// app/admin/replay/[table]/[id]/page.tsx — Track 9 time-travel debugger.
//
// WHAT
//   For a given record (e.g. /admin/replay/trips/abc-123), pulls the full
//   admin_events history and renders a horizontal slider. Each slider step
//   reveals the after-state at that point in time alongside a before/after
//   diff against the previous step.
//
// WHY
//   Lets ops answer "what did this trip look like 3 days ago" without
//   needing a database backup. Backed by the after-write triggers in
//   0018_aiops.sql, which capture every mutation on watched tables.
//
// ENV VARS
//   None directly.

import { use, useEffect, useMemo, useState } from "react";
import { JsonDiff } from "@/app/admin/_components/JsonDiff";

type Event = {
  kind: "insert" | "update" | "delete";
  before: unknown;
  after: unknown;
  ts: string;
};

export default function ReplayPage({
  params,
}: {
  // Next.js 16 — params is a Promise.
  params: Promise<{ table: string; id: string }>;
}) {
  const { table, id } = use(params);
  const [events, setEvents] = useState<Event[]>([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ kind: table, id });
        const res = await fetch(`/api/admin/replay/history?${params}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Fetch failed (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) {
          setEvents(data.events ?? []);
          setStep(Math.max(0, (data.events ?? []).length - 1));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [table, id]);

  const current = events[step];
  const previous = step > 0 ? events[step - 1] : null;

  const beforeForDiff = useMemo(() => {
    return previous?.after ?? current?.before ?? null;
  }, [previous, current]);

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>TIME TRAVEL</div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          {table} / {id}
        </h1>
        <p style={{ opacity: 0.7, fontSize: 13 }}>
          Reading from admin_events. Each step is a captured mutation.
        </p>
      </header>

      {loading ? (
        <div style={{ opacity: 0.6, fontSize: 13 }}>Loading history…</div>
      ) : error ? (
        <div
          style={{
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
      ) : events.length === 0 ? (
        <div style={{ opacity: 0.6, fontSize: 13 }}>
          No history captured for this record.
        </div>
      ) : (
        <>
          <div
            style={{
              padding: 14,
              background: "#11151a",
              border: "1px solid #1f2630",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              <span>
                Step {step + 1} of {events.length}
              </span>
              <span>{current ? new Date(current.ts).toLocaleString() : ""}</span>
            </div>
            <input
              type="range"
              min={0}
              max={events.length - 1}
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                opacity: 0.6,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{events[0] ? new Date(events[0].ts).toLocaleString() : ""}</span>
              <span>
                {events[events.length - 1]
                  ? new Date(events[events.length - 1].ts).toLocaleString()
                  : ""}
              </span>
            </div>
          </div>

          {current ? (
            <div
              style={{
                padding: 14,
                background: "#11151a",
                border: "1px solid #1f2630",
                borderRadius: 8,
              }}
            >
              <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.7 }}>
                Operation:{" "}
                <strong style={{ color: "#e6e8eb" }}>{current.kind}</strong>
              </div>
              <JsonDiff before={beforeForDiff} after={current.after ?? current.before} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
