"use client";

// app/admin/metrics/_components/ConcurrentPanel.tsx — Track 4 live "users
// online now" panel. Client component because we open a Supabase Realtime
// channel and re-poll the RPC on inserts.
//
// Behavior:
//   - On mount: render the server-provided initial number immediately.
//   - Subscribe to analytics_events INSERTs on the public Realtime channel.
//     RLS hides rows we can't read, but the channel still fires the *event*
//     so we can use it as a "something happened" signal and poll our own
//     /api/admin/metrics/concurrent endpoint for a fresh count.
//   - Falls back to a 30s setInterval if Realtime isn't configured.

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseEnabled } from "@/lib/supabase";

export function ConcurrentPanel({
  initial,
  windowMinutes = 5,
}: {
  initial: number;
  windowMinutes?: number;
}) {
  const [active, setActive] = useState(initial);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/metrics/concurrent?window=${windowMinutes}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setStale(true);
        return;
      }
      const j = (await res.json()) as { active: number };
      setActive(j.active);
      setStale(false);
    } catch {
      setStale(true);
    }
  }, [windowMinutes]);

  // 30s heartbeat — keeps the number fresh even when Realtime is down.
  useEffect(() => {
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Realtime: any analytics_events insert triggers a debounced refresh.
  useEffect(() => {
    if (!supabaseEnabled || !supabase) return;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("voyage-admin-metrics-concurrent")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "analytics_events" },
        () => {
          if (pending) return;
          // Debounce so a burst doesn't slam the RPC.
          pending = setTimeout(() => {
            pending = null;
            void refresh();
          }, 1500);
        }
      )
      .subscribe();
    return () => {
      if (pending) clearTimeout(pending);
      void supabase!.removeChannel(channel);
    };
  }, [refresh]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: "#e6e8eb",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {active.toLocaleString()}
        </span>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          users active in last {windowMinutes}m
        </span>
        <span
          aria-hidden
          style={{
            marginLeft: "auto",
            width: 8,
            height: 8,
            borderRadius: 4,
            background: stale ? "#fbbf24" : "#22c55e",
            boxShadow: stale ? "none" : "0 0 6px #22c55e",
          }}
        />
      </div>
      <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
        Live via Supabase Realtime; auto-refreshes every 30s.
      </p>
    </div>
  );
}
