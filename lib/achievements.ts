"use client";

import { computeTravelPatterns } from "./profile";
import { loadConfirmations } from "./wallet";
import { loadTrips } from "./storage";
import { resolveCountry } from "./destination-intel";
import type { Achievement } from "./types";

export type TravelStats = {
  countries: string[];
  countryCount: number;
  totalTrips: number;
  totalSpend: number;
  longestTripDays: number;
  favoriteAirline?: string;
  favoriteHotel?: string;
  /** Rough estimated miles from flight count + average leg distance. */
  estimatedMiles: number;
};

export function computeStats(): TravelStats {
  const trips = loadTrips();
  const wallet = loadConfirmations();
  const patterns = computeTravelPatterns({ trips, wallet });

  const countries = new Set<string>();
  for (const t of trips) {
    const intel = resolveCountry(t.destination);
    if (intel?.country) countries.add(intel.country);
  }

  const longestTripDays = trips.reduce((max, t) => {
    const days = Math.max(
      1,
      Math.round(
        (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1
    );
    return Math.max(max, days);
  }, 0);

  const flightCount = wallet.filter((w) => w.type === "flight").length;
  // Rough heuristic: average leg = 1500 miles. Real version would lookup
  // each route's distance.
  const estimatedMiles = flightCount * 1500;

  return {
    countries: Array.from(countries),
    countryCount: countries.size,
    totalTrips: patterns.totalTrips,
    totalSpend: patterns.totalSpend,
    longestTripDays,
    favoriteAirline: patterns.topAirlines[0]?.name,
    favoriteHotel: patterns.topHotels[0]?.name,
    estimatedMiles,
  };
}

export function computeAchievements(stats: TravelStats): Achievement[] {
  const list: Achievement[] = [
    {
      id: "first-trip",
      title: "First trip",
      description: "Plan your first trip in Voyage.",
      unlocked: stats.totalTrips >= 1,
    },
    {
      id: "first-international",
      title: "First international trip",
      description: "Travel to a country other than your home country.",
      unlocked: stats.countryCount >= 2,
    },
    {
      id: "ten-countries",
      title: "10 countries",
      description: "Visit ten different countries.",
      unlocked: stats.countryCount >= 10,
      progress: Math.min(1, stats.countryCount / 10),
    },
    {
      id: "five-continents",
      title: "5 continents",
      description: "Set foot on five continents.",
      unlocked: stats.countryCount >= 25,
      progress: Math.min(1, stats.countryCount / 25),
    },
    {
      id: "long-haul",
      title: "Long-haul",
      description: "Take a trip lasting 14+ days.",
      unlocked: stats.longestTripDays >= 14,
      progress: Math.min(1, stats.longestTripDays / 14),
    },
    {
      id: "100k-miles",
      title: "100k miles",
      description: "Estimated 100,000 flight miles flown.",
      unlocked: stats.estimatedMiles >= 100_000,
      progress: Math.min(1, stats.estimatedMiles / 100_000),
    },
    {
      id: "globetrotter",
      title: "Globetrotter",
      description: "5 trips planned.",
      unlocked: stats.totalTrips >= 5,
      progress: Math.min(1, stats.totalTrips / 5),
    },
    {
      id: "high-roller",
      title: "High roller",
      description: "Total trip spend over $10,000.",
      unlocked: stats.totalSpend >= 10_000,
      progress: Math.min(1, stats.totalSpend / 10_000),
    },
  ];
  return list;
}
