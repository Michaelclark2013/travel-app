"use client";

// components/AdminPresence.tsx — Track 9 live admin presence.
//
// WHAT
//   Subscribes to a Supabase Realtime presence channel keyed by
//   `admin:${pageKey}` (e.g. "admin:users:abc-123"). Renders small avatar
//   bubbles in the corner showing every other admin currently viewing the
//   same record.
//
// WHY
//   Avoid double-replies on tickets, double-actions on user accounts. Anyone
//   who's worked support knows this saves a lot of back-and-forth.
//
// IMPLEMENTATION NOTES
//   - Reuses the project Supabase client from lib/supabase.ts. Presence is
//     a free Realtime feature; no new tables or env vars.
//   - Identity comes from /api/admin/session — we hash adminId so the
//     channel doesn't broadcast raw uuids.
//   - Hue is derived from the hash so each admin gets a stable color.
//
// USAGE
//   <AdminPresence pageKey={`users:${userId}`} />
//
// ENV VARS
//   None directly. Inherits NEXT_PUBLIC_SUPABASE_* from the client SDK.

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type Peer = {
  id: string;
  email: string;
  hue: number;
  joinedAt: number;
};

function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export default function AdminPresence({ pageKey }: { pageKey: string }) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);

  // Pull the current admin so we can broadcast our own presence.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.session) return;
        const id = String(data.session.adminId ?? "");
        const email = String(data.session.email ?? id.slice(0, 8));
        setMe({ id, email });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const channelName = `admin:${pageKey}`;

  useEffect(() => {
    if (!supabaseEnabled || !supabase || !me) return;

    const presenceKey = shortHash(me.id);
    const channel = supabase.channel(channelName, {
      config: { presence: { key: presenceKey } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const next: Peer[] = [];
        for (const [key, entries] of Object.entries(state)) {
          if (key === presenceKey) continue;
          const entry = (entries as Array<{ email?: string; ts?: number }>)[0];
          const hue = parseInt(key.slice(0, 4), 16) % 360;
          next.push({
            id: key,
            email: entry?.email ?? key.slice(0, 6),
            hue,
            joinedAt: entry?.ts ?? Date.now(),
          });
        }
        setPeers(next);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ email: me.email, ts: Date.now() });
        }
      });

    return () => {
      channel.untrack();
      if (supabase) supabase.removeChannel(channel);
    };
  }, [channelName, me]);

  const sorted = useMemo(() => [...peers].sort((a, b) => a.joinedAt - b.joinedAt), [
    peers,
  ]);

  if (!sorted.length) return null;

  return (
    <div
      aria-label={`${sorted.length} other admin${sorted.length === 1 ? "" : "s"} viewing`}
      style={{
        position: "fixed",
        top: 60,
        right: 16,
        zIndex: 40,
        display: "flex",
        gap: -6,
        padding: 4,
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 999,
      }}
    >
      {sorted.slice(0, 5).map((p) => (
        <div
          key={p.id}
          title={`${p.email} • viewing`}
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: `hsl(${p.hue}, 60%, 45%)`,
            color: "white",
            border: "2px solid #11151a",
            marginLeft: -8,
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {p.email.slice(0, 2)}
        </div>
      ))}
      {sorted.length > 5 ? (
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "#2a3340",
            color: "#e6e8eb",
            border: "2px solid #11151a",
            marginLeft: -8,
            display: "grid",
            placeItems: "center",
            fontSize: 10,
          }}
        >
          +{sorted.length - 5}
        </div>
      ) : null}
    </div>
  );
}
