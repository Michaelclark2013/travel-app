"use client";

import { use, useEffect, useMemo, useState } from "react";
import { loadShare, type SharePayload } from "@/lib/wallet-share";
import { summarize } from "@/lib/wallet";
import { ConfirmationCard, SpendingView, TimelineView } from "../../_components";

type ViewMode = "cards" | "timeline" | "spending";

export default function ShareWalletPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [snapshot, setSnapshot] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("cards");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Try the localStorage copy first (covers same-device demo flows), then
      // fall back to the public API.
      let snap = await loadShare(token);
      if (!snap) {
        try {
          const res = await fetch(`/api/wallet/share/${token}`);
          if (res.ok) {
            const json = await res.json();
            if (json.ok) snap = json.snapshot as SharePayload;
          }
        } catch {
          // ignore — we surface a friendly not-found below.
        }
      }
      if (!cancelled) {
        setSnapshot(snap);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const av = `${a.date} ${a.time ?? ""}`;
        const bv = `${b.date} ${b.time ?? ""}`;
        return av.localeCompare(bv);
      }),
    [items]
  );
  const summary = useMemo(() => summarize(items), [items]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Loading shared wallet…
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center">
        <div className="text-6xl mb-5">🔗</div>
        <h1 className="text-3xl font-bold">Share link not found</h1>
        <p className="text-[var(--muted)] mt-3 max-w-md mx-auto">
          This wallet may have been revoked, or the link is invalid.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--accent)] font-mono">
            Shared wallet · read only
          </div>
          <h1 className="text-4xl font-bold tracking-tight mt-2">
            {snapshot.tripLabel}
          </h1>
          <p className="text-[var(--muted)] mt-2">
            Shared by {snapshot.ownerName} · {items.length} confirmation
            {items.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-sm">
        {(["cards", "timeline", "spending"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setView(m)}
            className={
              "px-3 py-1.5 rounded-md border " +
              (view === m
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]")
            }
          >
            {m === "cards" ? "Cards" : m === "timeline" ? "Timeline" : "Spending"}
          </button>
        ))}
      </div>

      {items.length === 0 && (
        <div className="steel mt-10 p-12 text-center text-[var(--muted)]">
          This share is empty.
        </div>
      )}

      {items.length > 0 && view === "cards" && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {sorted.map((c) => (
            <ConfirmationCard key={c.id} c={c} readOnly />
          ))}
        </div>
      )}
      {items.length > 0 && view === "timeline" && <TimelineView items={sorted} />}
      {items.length > 0 && view === "spending" && <SpendingView summary={summary} />}
    </div>
  );
}
