"use client";

import type { LocalEvent, Trip } from "./types";

// Mock event source — generates plausible-looking destination-themed events
// for the trip date range. Replacing this with a real Eventbrite /
// Ticketmaster / Bandsintown call is a one-file swap.

const TEMPLATES: { match: RegExp; events: Omit<LocalEvent, "id" | "date">[] }[] = [
  {
    match: /tokyo|kyoto|japan/i,
    events: [
      {
        title: "TeamLab Borderless — digital art experience",
        category: "exhibition",
        startTime: "10:00",
        venue: "Azabudai Hills",
        blurb: "Immersive digital art collective. Buy tickets ahead — sells out daily.",
      },
      {
        title: "Tsukiji Outer Market food crawl",
        category: "food",
        startTime: "08:00",
        venue: "Tsukiji",
        blurb: "Best in the morning — uni, tamagoyaki, fresh maguro.",
      },
      {
        title: "Sumida River fireworks (seasonal)",
        category: "festival",
        startTime: "19:00",
        venue: "Sumida River",
        blurb: "Major summer festival — book a riverside reservation early.",
      },
    ],
  },
  {
    match: /paris|france/i,
    events: [
      {
        title: "Late opening at the Louvre",
        category: "exhibition",
        startTime: "18:00",
        venue: "Musée du Louvre",
        blurb: "Wednesdays + Fridays — fewer crowds, better photos.",
      },
      {
        title: "Marché des Enfants Rouges",
        category: "market",
        startTime: "08:30",
        venue: "Le Marais",
        blurb: "Oldest covered market in Paris. Lunch counters, not just shopping.",
      },
      {
        title: "Philharmonie de Paris concert",
        category: "music",
        startTime: "20:00",
        venue: "Cité de la Musique",
        blurb: "World-class orchestra venue — check program for your dates.",
      },
    ],
  },
  {
    match: /london|england|uk/i,
    events: [
      {
        title: "Borough Market lunch crawl",
        category: "market",
        startTime: "11:00",
        venue: "Borough Market",
        blurb: "Skip Saturday if crowd-averse — Friday lunch is the sweet spot.",
      },
      {
        title: "West End theatre — TKTS same-day discounts",
        category: "exhibition",
        startTime: "19:30",
        venue: "Leicester Square TKTS",
        blurb: "Best deals on day-of seats. Cash + card accepted.",
      },
      {
        title: "Wembley football — check fixtures",
        category: "sports",
        startTime: "15:00",
        venue: "Wembley Stadium",
        blurb: "International + cup matches. Plan transit return — closes quickly.",
      },
    ],
  },
  {
    match: /new york|nyc/i,
    events: [
      {
        title: "Brooklyn Smorgasburg",
        category: "food",
        startTime: "11:00",
        venue: "Williamsburg / Prospect Park",
        blurb: "Saturdays Wburg, Sundays Prospect Park. ~80 vendors, all open-air.",
      },
      {
        title: "Met Museum free hour",
        category: "exhibition",
        startTime: "10:00",
        venue: "5th Ave",
        blurb: "Pay-what-you-wish for NY State residents; suggested $30 otherwise.",
      },
      {
        title: "Jazz at Smalls",
        category: "music",
        startTime: "19:30",
        venue: "Greenwich Village",
        blurb: "Tiny basement room. Sets at 7:30, 9:30, 11:30 + late jam.",
      },
    ],
  },
  {
    match: /mexico|cdmx/i,
    events: [
      {
        title: "Mercado de Coyoacán",
        category: "market",
        startTime: "09:00",
        venue: "Coyoacán",
        blurb: "Tostadas, churros, and a colorful market in a chill neighborhood.",
      },
      {
        title: "Lucha Libre at Arena México",
        category: "sports",
        startTime: "20:30",
        venue: "Doctores",
        blurb: "Friday nights = main fight. Buy ringside if you can; mid-tier is fine.",
      },
    ],
  },
];

const GENERIC: Omit<LocalEvent, "id" | "date">[] = [
  {
    title: "Saturday farmers' market",
    category: "market",
    startTime: "09:00",
    venue: "Town center",
    blurb: "Most cities have one — usually Saturday morning. Worth a stop.",
  },
  {
    title: "Live music at a local venue",
    category: "music",
    startTime: "20:00",
    venue: "Check local listings",
    blurb: "Search Bandsintown or Songkick for your dates.",
  },
  {
    title: "Free walking tour",
    category: "exhibition",
    startTime: "10:00",
    venue: "Tourist info / hostel",
    blurb: "Tip-based, locally-led. Best way to learn the layout in 2 hours.",
  },
];

export function discoverEvents(trip: Trip): LocalEvent[] {
  const set = TEMPLATES.find((t) => t.match.test(trip.destination));
  const pool = set?.events ?? GENERIC;
  // Spread one event per day across the trip range, cycling through the pool.
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  const out: LocalEvent[] = [];
  let i = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const tpl = pool[i % pool.length];
    out.push({
      ...tpl,
      id: `evt-${trip.id}-${d.toISOString().slice(0, 10)}-${i}`,
      date: d.toISOString().slice(0, 10),
    });
    i++;
  }
  return out;
}
