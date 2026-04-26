"use client";

import type { Confirmation } from "./wallet";
import type { CreditCard, CreditCardCategory } from "./types";

// Type-of-booking → reward category match.
const TYPE_TO_CATEGORY: Record<Confirmation["type"], CreditCardCategory[]> = {
  flight: ["flights", "travel", "everything"],
  hotel: ["hotels", "travel", "everything"],
  car: ["travel", "everything"],
  restaurant: ["dining", "everything"],
  activity: ["entertainment", "travel", "everything"],
  train: ["transit", "travel", "everything"],
  cruise: ["travel", "everything"],
};

export type CardRecommendation = {
  card: CreditCard;
  multiplier: number;
  category: CreditCardCategory;
  estimatedPoints: number;
};

export function recommendCardForBooking(args: {
  cards: CreditCard[];
  booking: Confirmation;
}): CardRecommendation | null {
  const { cards, booking } = args;
  if (cards.length === 0 || booking.totalUsd == null) return null;

  const eligible = TYPE_TO_CATEGORY[booking.type] ?? ["everything"];

  let best: CardRecommendation | null = null;
  for (const c of cards) {
    for (const r of c.rewards) {
      if (!eligible.includes(r.category)) continue;
      if (!best || r.multiplier > best.multiplier) {
        best = {
          card: c,
          multiplier: r.multiplier,
          category: r.category,
          estimatedPoints: Math.round(booking.totalUsd * r.multiplier),
        };
      }
    }
  }
  return best;
}

// Curated starter set users can add with one click.
export const POPULAR_CARDS: CreditCard[] = [
  {
    id: "csr",
    name: "Chase Sapphire Reserve",
    issuer: "Chase",
    rewards: [
      { category: "travel", multiplier: 3 },
      { category: "dining", multiplier: 3 },
      { category: "everything", multiplier: 1 },
    ],
    notes: "$300 travel credit · Priority Pass lounges",
  },
  {
    id: "csp",
    name: "Chase Sapphire Preferred",
    issuer: "Chase",
    rewards: [
      { category: "travel", multiplier: 2 },
      { category: "dining", multiplier: 3 },
      { category: "everything", multiplier: 1 },
    ],
  },
  {
    id: "amex-gold",
    name: "Amex Gold",
    issuer: "American Express",
    rewards: [
      { category: "dining", multiplier: 4 },
      { category: "groceries", multiplier: 4 },
      { category: "flights", multiplier: 3 },
      { category: "everything", multiplier: 1 },
    ],
    notes: "Up to $120 in dining credits",
  },
  {
    id: "amex-platinum",
    name: "Amex Platinum",
    issuer: "American Express",
    rewards: [
      { category: "flights", multiplier: 5 },
      { category: "hotels", multiplier: 5 },
      { category: "everything", multiplier: 1 },
    ],
    notes: "Centurion + Priority Pass · $200 travel credit",
  },
  {
    id: "capital-one-venture-x",
    name: "Capital One Venture X",
    issuer: "Capital One",
    rewards: [
      { category: "travel", multiplier: 2 },
      { category: "everything", multiplier: 2 },
      { category: "hotels", multiplier: 10 },
      { category: "flights", multiplier: 5 },
    ],
    notes: "$300 Capital One Travel credit · Priority Pass",
  },
];
