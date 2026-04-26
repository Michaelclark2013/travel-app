"use client";

import { getSession } from "./auth";

export type CardCategory =
  | "flights"
  | "hotels"
  | "dining"
  | "rental_cars"
  | "transit"
  | "everything";

export type LoyaltyCard = {
  id: string;
  name: string;
  network: "visa" | "mastercard" | "amex" | "discover";
  multipliers: { category: CardCategory; pointsPerDollar: number; note?: string }[];
  pointsValueCents: number; // implied per-point value
};

export const SAMPLE_CARDS: LoyaltyCard[] = [
  {
    id: "csr",
    name: "Chase Sapphire Reserve",
    network: "visa",
    pointsValueCents: 2.0,
    multipliers: [
      { category: "flights", pointsPerDollar: 5, note: "via Chase Travel" },
      { category: "hotels", pointsPerDollar: 10, note: "via Chase Travel" },
      { category: "dining", pointsPerDollar: 3 },
      { category: "everything", pointsPerDollar: 1 },
    ],
  },
  {
    id: "amex-plat",
    name: "American Express Platinum",
    network: "amex",
    pointsValueCents: 1.8,
    multipliers: [
      { category: "flights", pointsPerDollar: 5, note: "directly with airline" },
      { category: "hotels", pointsPerDollar: 5, note: "via Amex Travel" },
      { category: "everything", pointsPerDollar: 1 },
    ],
  },
  {
    id: "amex-gold",
    name: "American Express Gold",
    network: "amex",
    pointsValueCents: 1.8,
    multipliers: [
      { category: "dining", pointsPerDollar: 4 },
      { category: "flights", pointsPerDollar: 3 },
      { category: "everything", pointsPerDollar: 1 },
    ],
  },
  {
    id: "venture-x",
    name: "Capital One Venture X",
    network: "visa",
    pointsValueCents: 1.7,
    multipliers: [
      { category: "flights", pointsPerDollar: 5, note: "via Capital One Travel" },
      { category: "hotels", pointsPerDollar: 10, note: "via Capital One Travel" },
      { category: "everything", pointsPerDollar: 2 },
    ],
  },
  {
    id: "freedom-unlimited",
    name: "Chase Freedom Unlimited",
    network: "visa",
    pointsValueCents: 1.0,
    multipliers: [
      { category: "dining", pointsPerDollar: 3 },
      { category: "everything", pointsPerDollar: 1.5 },
    ],
  },
];

const KEY = "voyage:cards";

function key(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadUserCards(): string[] {
  if (typeof window === "undefined") return [];
  const k = key();
  if (!k) return [];
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "[]");
  } catch {
    return [];
  }
}

export function saveUserCards(ids: string[]) {
  const k = key();
  if (!k || typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(ids));
}

export function bestCardFor(
  category: CardCategory,
  cardIds: string[]
): { card: LoyaltyCard; pointsPerDollar: number; valuePct: number; note?: string } | null {
  const owned = SAMPLE_CARDS.filter((c) => cardIds.includes(c.id));
  if (owned.length === 0) return null;
  let best: ReturnType<typeof bestCardFor> = null;
  for (const c of owned) {
    const m =
      c.multipliers.find((x) => x.category === category) ??
      c.multipliers.find((x) => x.category === "everything");
    if (!m) continue;
    const valuePct = (m.pointsPerDollar * c.pointsValueCents) / 100;
    if (!best || valuePct > best.valuePct) {
      best = {
        card: c,
        pointsPerDollar: m.pointsPerDollar,
        valuePct,
        note: m.note,
      };
    }
  }
  return best;
}
