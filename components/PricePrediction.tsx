"use client";

import { useMemo, useState } from "react";
import { addWatch, predict } from "@/lib/price-prediction";

export default function PricePrediction({
  kind,
  predictKey,
  label,
  price,
  compact = false,
}: {
  kind: "flight" | "hotel";
  predictKey: string;
  label: string;
  price: number;
  compact?: boolean;
}) {
  const p = useMemo(
    () => predict({ kind, key: predictKey, price }),
    [kind, predictKey, price]
  );
  const [watching, setWatching] = useState(false);

  function handleWatch() {
    addWatch({
      kind,
      label,
      key: predictKey,
      targetPrice: Math.min(p.predicted, price - 1),
      currentPrice: price,
    });
    setWatching(true);
  }

  const badge = (() => {
    if (p.verdict === "buy_now")
      return {
        label: "Book now",
        cls: "bg-rose-500/15 text-rose-200 border-rose-500/40",
      };
    if (p.verdict === "wait")
      return {
        label: `Wait — likely $${p.current - p.predicted} cheaper`,
        cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
      };
    return {
      label: "Stable price",
      cls: "bg-white/5 text-[var(--muted)] border-[var(--border)]",
    };
  })();

  if (compact) {
    return (
      <div className="text-[10px] flex items-center gap-2 mt-1">
        <span className={`rounded-full border px-2 py-0.5 ${badge.cls}`}>
          {badge.label}
        </span>
        {p.verdict === "wait" && !watching && (
          <button
            onClick={handleWatch}
            className="text-[10px] text-[var(--muted)] hover:text-white underline-offset-2 hover:underline"
          >
            Watch
          </button>
        )}
        {watching && <span className="text-[10px] text-emerald-300">✓ Watching</span>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3">
      <div className="flex items-center justify-between">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-[10px] font-mono text-[var(--muted)]">
          {Math.round(p.confidence * 100)}% confidence
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">{p.reason}</p>
      {p.verdict !== "buy_now" && !watching && (
        <button
          onClick={handleWatch}
          className="btn-ghost mt-3 px-3 py-1.5 text-xs"
        >
          Watch this price
        </button>
      )}
      {watching && (
        <div className="mt-3 text-xs text-emerald-300">
          ✓ We&apos;ll alert you when it drops below ${p.predicted}.
        </div>
      )}
    </div>
  );
}
