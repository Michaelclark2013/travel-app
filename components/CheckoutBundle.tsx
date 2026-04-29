"use client";

import { useState } from "react";
import {
  quoteBundle,
  type CheckoutBundleQuote,
  type InsuranceTier,
} from "@/lib/checkout-bundle";

export default function CheckoutBundle({
  destination,
  startDate,
  endDate,
  travelers,
  distanceMiles,
  estimatedSpendUsd,
}: {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  distanceMiles: number;
  estimatedSpendUsd: number;
}) {
  const quote: CheckoutBundleQuote = quoteBundle({
    destination,
    startDate,
    endDate,
    travelers,
    distanceMiles,
    estimatedSpendUsd,
  });

  const [insurancePicked, setInsurancePicked] = useState<InsuranceTier | null>(
    quote.recommendation
  );
  const [offsetPicked, setOffsetPicked] = useState(true);

  const insuranceQuote =
    insurancePicked != null
      ? quote.insurance.find((q) => q.tier === insurancePicked)
      : null;
  const total =
    (insuranceQuote?.priceUsd ?? 0) +
    (offsetPicked ? quote.carbonOffset.offsetUsd : 0);

  return (
    <div className="surface rounded-2xl p-5">
      <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
        // 08 · PROTECT YOUR TRIP
      </div>
      <div className="mt-1 text-lg font-semibold">
        Optional add-ons
      </div>
      <div className="text-xs text-[var(--muted)] mt-1">
        Recommended for ${estimatedSpendUsd.toLocaleString()} trip · {travelers}{" "}
        traveler{travelers === 1 ? "" : "s"}
      </div>

      <div className="mt-5 space-y-4">
        {/* Insurance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Travel insurance</div>
            <button
              onClick={() => setInsurancePicked(null)}
              className={`text-xs ${
                insurancePicked == null
                  ? "text-[var(--muted)]"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              {insurancePicked == null ? "Skipped" : "Skip"}
            </button>
          </div>
          {/* Track D: Pro perk — insurance comps for subscribers. The actual
              comp logic lives in the eventual Stripe-aware checkout, not here. */}
          <div className="mb-2 text-[11px] text-[var(--accent)]">
            ✦ Insurance is free for Voyage Pro members.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {quote.insurance.map((q) => {
              const active = insurancePicked === q.tier;
              const isRec = q.tier === quote.recommendation;
              return (
                <button
                  key={q.tier}
                  onClick={() => setInsurancePicked(q.tier)}
                  className={`text-left rounded-xl p-3 border transition ${
                    active
                      ? "bg-[var(--accent-soft)] border-[var(--accent)]"
                      : "bg-[var(--card-strong)] border-[var(--border)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-wider text-[var(--muted)] capitalize">
                      {q.tier}
                    </div>
                    {isRec && (
                      <span className="text-[10px] font-mono tracking-wider text-[var(--accent)]">
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-semibold tracking-tight mt-1">
                    ${q.priceUsd}
                  </div>
                  <ul className="mt-2 text-[11px] text-[var(--muted)] space-y-0.5">
                    {q.features.slice(0, 3).map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        {/* Offset */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">
              🌱 Offset {quote.carbonOffset.flightCo2Kg.toLocaleString()} kg CO₂
            </div>
            <div className="text-xs text-[var(--muted)] mt-1">
              Verified offsets via {quote.carbonOffset.provider}. Funds verified
              reforestation + DAC projects.
            </div>
          </div>
          <button
            onClick={() => setOffsetPicked((v) => !v)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              offsetPicked
                ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                : "bg-transparent border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {offsetPicked ? `+ $${quote.carbonOffset.offsetUsd}` : "Skip"}
          </button>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--border)] flex items-baseline justify-between">
        <div className="text-xs text-[var(--muted)] uppercase tracking-wider font-mono">
          Add-on total
        </div>
        <div className="text-2xl font-semibold tracking-tight">
          ${total.toLocaleString()}
        </div>
      </div>
      <div className="text-[10px] text-[var(--muted)] mt-2">
        Voyage earns a referral commission on add-ons. Your price is the same
        as buying direct.
      </div>
    </div>
  );
}
