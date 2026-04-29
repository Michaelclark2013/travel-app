"use client";

// Simple deterministic price-prediction stub. A real impl would query a
// price-history feed (Hopper API, Google Travel Insights, or your own logged
// quotes) and run a regression. The output shape is what the UI binds against,
// so swapping in real predictions later won't change components.

import { getSession } from "./auth";

export type Verdict = "buy_now" | "wait" | "hold";

export type Prediction = {
  current: number;
  predictedLow: number;
  predictedHigh: number;
  /** Best-guess single-number forecast for ~14 days from now. */
  predicted: number;
  /** 0-1, how confident we are. */
  confidence: number;
  verdict: Verdict;
  reason: string;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function predict(
  context: { kind: "flight" | "hotel"; key: string; price: number }
): Prediction {
  const seed = hash(`${context.kind}:${context.key}`);
  // Pseudo-random but stable: pick a -25% to +12% delta.
  const pct = ((seed % 37) - 25) / 100;
  const predicted = Math.max(50, Math.round(context.price * (1 + pct)));
  const predictedLow = Math.round(context.price * (1 + pct - 0.06));
  const predictedHigh = Math.round(context.price * (1 + pct + 0.06));
  const confidence = 0.55 + ((seed % 40) / 100); // 55-95%

  let verdict: Verdict = "hold";
  let reason = "";
  const delta = predicted - context.price;
  if (delta < -context.price * 0.07) {
    verdict = "wait";
    reason = `Likely to drop ~$${Math.abs(delta)} in the next 2 weeks based on historical patterns.`;
  } else if (delta > context.price * 0.05) {
    verdict = "buy_now";
    reason = `Prices typically rise ~$${delta} closer to departure. Lock in now.`;
  } else {
    verdict = "hold";
    reason = "Prices are stable — book whenever you're ready.";
  }
  return {
    current: context.price,
    predicted,
    predictedLow,
    predictedHigh,
    confidence,
    verdict,
    reason,
  };
}

// ---------------- Price watches (per-user, localStorage) ----------------

export type PriceWatch = {
  id: string;
  kind: "flight" | "hotel";
  /** Display label e.g. "JFK → NRT, May 10" */
  label: string;
  /** Underlying key for re-quoting. */
  key: string;
  targetPrice: number;
  currentPrice: number;
  createdAt: string;
};

const KEY = "voyage:price-watches";

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadWatches(): PriceWatch[] {
  if (typeof window === "undefined") return [];
  const k = localKey();
  if (!k) return [];
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "[]");
  } catch {
    return [];
  }
}

export function addWatch(w: Omit<PriceWatch, "id" | "createdAt">) {
  const watch: PriceWatch = {
    ...w,
    id: `pw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  const k = localKey();
  if (!k || typeof window === "undefined") return watch;
  const all = [watch, ...loadWatches()];
  window.localStorage.setItem(k, JSON.stringify(all));
  return watch;
}

export function removeWatch(id: string) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  window.localStorage.setItem(
    k,
    JSON.stringify(loadWatches().filter((w) => w.id !== id))
  );
}
