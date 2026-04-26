"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  SAMPLE_CARDS,
  bestCardFor,
  loadUserCards,
  saveUserCards,
  type CardCategory,
} from "@/lib/loyalty";

const CATEGORIES: { id: CardCategory; label: string; icon: string }[] = [
  { id: "flights", label: "Flights", icon: "✈️" },
  { id: "hotels", label: "Hotels", icon: "🏨" },
  { id: "rental_cars", label: "Rental cars", icon: "🚗" },
  { id: "dining", label: "Dining", icon: "🍽️" },
  { id: "transit", label: "Transit", icon: "🚆" },
];

export default function PointsPage() {
  const { user, ready } = useRequireAuth();
  const [owned, setOwned] = useState<string[]>([]);

  useEffect(() => {
    if (!ready || !user) return;
    setOwned(loadUserCards());
  }, [ready, user]);

  function toggle(id: string) {
    const next = owned.includes(id) ? owned.filter((x) => x !== id) : [...owned, id];
    setOwned(next);
    saveUserCards(next);
  }

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">Points & rewards</h1>
      <p className="text-[var(--muted)] mt-3 max-w-2xl">
        Tell us which cards you have. We&apos;ll automatically suggest the
        right one to use for each booking — flights, hotels, dining,
        everything.
      </p>

      <div className="steel mt-8 p-6">
        <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
          YOUR CARDS
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SAMPLE_CARDS.map((c) => {
            const isOwned = owned.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={`p-4 border text-left transition ${
                  isOwned
                    ? "bg-white text-black border-white"
                    : "bg-black/40 border-[var(--edge)] hover:border-[var(--edge-strong)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold">{c.name}</div>
                  <div className={`text-xs uppercase tracking-wider ${isOwned ? "text-black/60" : "text-[var(--muted)]"}`}>
                    {c.network}
                  </div>
                </div>
                <div className={`text-xs mt-1 ${isOwned ? "text-black/70" : "text-[var(--muted)]"}`}>
                  {c.multipliers.length} earn categories · {c.pointsValueCents}¢/pt
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="steel mt-6 p-6">
        <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
          BEST CARD PER CATEGORY
        </div>
        {owned.length === 0 ? (
          <p className="mt-3 text-[var(--muted)] text-sm">
            Pick at least one card above to see recommendations.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => {
              const best = bestCardFor(cat.id, owned);
              return (
                <div
                  key={cat.id}
                  className="bg-black/40 border border-[var(--edge)] p-4"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{cat.icon}</span>
                    <div className="font-medium">{cat.label}</div>
                  </div>
                  {best ? (
                    <>
                      <div className="mt-3 text-lg font-bold">
                        {best.card.name}
                      </div>
                      <div className="text-sm text-[var(--muted)] mt-1">
                        {best.pointsPerDollar}× points · ~{(best.valuePct * 100).toFixed(1)}% effective return
                      </div>
                      {best.note && (
                        <div className="text-xs text-[var(--muted)] mt-1">
                          {best.note}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-3 text-sm text-[var(--muted)]">
                      No card optimized for {cat.label.toLowerCase()}.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
