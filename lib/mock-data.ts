import type {
  Flight,
  Hotel,
  ItineraryDay,
  ItineraryItem,
  Leg,
  TransportMode,
} from "./types";

const AIRLINES = [
  "Skyline",
  "Atlas Air",
  "Nimbus",
  "Polaris",
  "Vector",
  "Meridian",
  "Solstice",
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function fmtTime(totalMin: number) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${pad(h)}:${pad(m)}`;
}

export function generateFlights(
  origin: string,
  destination: string,
  date: string
): Flight[] {
  const seed = hashString(`${origin}|${destination}|${date}`);
  const r = rand(seed);
  const baseDuration = 90 + Math.floor(r() * 540);
  const basePrice = 120 + Math.floor(r() * 700);

  return Array.from({ length: 8 }, (_, i) => {
    const departMin = 5 * 60 + Math.floor(r() * 16 * 60);
    const dur = baseDuration + Math.floor(r() * 180) - 60;
    const stops = r() < 0.55 ? 0 : r() < 0.85 ? 1 : 2;
    const stopMultiplier = stops === 0 ? 1.25 : stops === 1 ? 1 : 0.78;
    const price = Math.round(basePrice * stopMultiplier + (r() - 0.5) * 80);
    return {
      id: `fl-${seed}-${i}`,
      airline: AIRLINES[Math.floor(r() * AIRLINES.length)],
      from: origin.toUpperCase(),
      to: destination.toUpperCase(),
      departTime: fmtTime(departMin),
      arriveTime: fmtTime(departMin + dur),
      durationMinutes: dur,
      stops,
      price: Math.max(89, price),
    };
  }).sort((a, b) => a.price - b.price);
}

const HOTEL_NAMES = [
  "The Maris",
  "Hotel Lumen",
  "Casa Verde",
  "The Wayfarer",
  "Northstar Lodge",
  "Hotel Solène",
  "The Marlow",
  "Bayview Suites",
  "The Atlas",
  "Maison Doré",
];

const AMENITIES = [
  "Wi-Fi",
  "Pool",
  "Gym",
  "Breakfast",
  "Spa",
  "Bar",
  "Rooftop",
  "Pet-friendly",
  "Free parking",
  "Airport shuttle",
];

export function generateHotels(city: string, checkIn: string): Hotel[] {
  const seed = hashString(`${city}|${checkIn}`);
  const r = rand(seed);
  return Array.from({ length: 8 }, (_, i) => {
    const rating = Math.round((3.5 + r() * 1.5) * 10) / 10;
    const reviews = 80 + Math.floor(r() * 4200);
    const amenities = AMENITIES.filter(() => r() > 0.55).slice(0, 5);
    return {
      id: `ht-${seed}-${i}`,
      name: HOTEL_NAMES[(Math.floor(r() * 100) + i) % HOTEL_NAMES.length],
      city,
      rating,
      reviews,
      pricePerNight: 75 + Math.floor(r() * 425),
      amenities: amenities.length ? amenities : ["Wi-Fi"],
      imageHue: Math.floor(r() * 360),
    };
  }).sort((a, b) => a.pricePerNight - b.pricePerNight);
}

const ACTIVITY_TEMPLATES: Array<{
  time: string;
  title: (d: string) => string;
  description: (d: string) => string;
  category: ItineraryItem["category"];
}> = [
  {
    time: "08:30",
    title: () => "Breakfast at a local café",
    description: (d) => `Fuel up before exploring ${d}. Try a regional pastry.`,
    category: "food",
  },
  {
    time: "10:00",
    title: (d) => `Walking tour of historic ${d}`,
    description: () =>
      "Highlights include the old quarter, main square, and a hidden viewpoint.",
    category: "activity",
  },
  {
    time: "12:30",
    title: () => "Lunch at a neighborhood spot",
    description: () => "Casual, well-rated, with a few vegetarian options.",
    category: "food",
  },
  {
    time: "14:30",
    title: (d) => `Museum or cultural site in ${d}`,
    description: () => "Pre-book tickets to skip the line.",
    category: "activity",
  },
  {
    time: "17:30",
    title: () => "Sunset viewpoint",
    description: () => "Bring a layer — it gets breezy as the sun dips.",
    category: "activity",
  },
  {
    time: "19:30",
    title: (d) => `Dinner reservation in ${d}`,
    description: () => "Tasting menu or a long-table local favorite.",
    category: "food",
  },
];

// Generic neighborhood templates. Each day picks 1-2 of these as anchors so
// stops cluster geographically and don't bounce across town.
const NEIGHBORHOODS = [
  { name: "Old Town", offset: [0.004, 0.002] },
  { name: "Waterfront", offset: [-0.012, 0.018] },
  { name: "Arts District", offset: [0.014, -0.008] },
  { name: "Market Quarter", offset: [-0.006, -0.014] },
  { name: "Hillside", offset: [0.009, 0.011] },
  { name: "Riverside", offset: [-0.018, 0.004] },
] as const;

function destinationCenter(destination: string): [number, number] {
  // Deterministic pseudo-coords from destination string. They're not real GPS,
  // but distance math between same-trip points is consistent.
  const seed = hashString(destination);
  const r = rand(seed);
  return [(r() - 0.5) * 140, (r() - 0.5) * 360];
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function legFor(mode: TransportMode, meters: number): Leg {
  // Rough urban speeds + per-trip fixed overhead (waiting, parking, etc).
  let minutes: number;
  if (mode === "walk") {
    minutes = meters / 80; // ~80 m/min ≈ 4.8 km/h
  } else if (mode === "transit") {
    minutes = 6 + meters / 400; // 6 min wait + ~24 km/h
  } else {
    minutes = 3 + meters / 500; // 3 min park + ~30 km/h
  }
  return { mode, minutes: Math.max(1, Math.round(minutes)), meters: Math.round(meters) };
}

export function generateItinerary(
  destination: string,
  startDate: string,
  endDate: string,
  mode: TransportMode = "transit"
): ItineraryDay[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days: ItineraryDay[] = [];
  const seed = hashString(`${destination}|${startDate}|${endDate}`);
  const r = rand(seed);
  const [centerLat, centerLng] = destinationCenter(destination);

  let dayIdx = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    // Pick 1-2 anchor neighborhoods for this day, rotating so days vary.
    const primary = NEIGHBORHOODS[dayIdx % NEIGHBORHOODS.length];
    const useSecondary = r() > 0.55;
    const secondary = useSecondary
      ? NEIGHBORHOODS[(dayIdx + 2) % NEIGHBORHOODS.length]
      : null;

    const templates = ACTIVITY_TEMPLATES.filter(() => r() > 0.15);
    const items: ItineraryItem[] = templates.map((t, i) => {
      const useSec = secondary && i >= Math.ceil(templates.length / 2);
      const hood = useSec ? secondary : primary;
      const jitterLat = (r() - 0.5) * 0.004;
      const jitterLng = (r() - 0.5) * 0.004;
      const lat = centerLat + hood.offset[0] + jitterLat;
      const lng = centerLng + hood.offset[1] + jitterLng;
      return {
        id: `${date}-${i}`,
        time: t.time,
        title: t.title(destination),
        description: `${t.description(destination)} (${hood.name})`,
        category: t.category,
        location: { name: hood.name, lat, lng },
      };
    });

    days.push({ date, label, items });
    dayIdx++;
  }

  if (days.length > 0) {
    days[0].items.unshift({
      id: `${days[0].date}-arrival`,
      time: "14:00",
      title: `Arrive in ${destination}`,
      description: "Drop bags at the hotel and stretch your legs.",
      category: "transit",
      location: {
        name: NEIGHBORHOODS[0].name,
        lat: centerLat + NEIGHBORHOODS[0].offset[0],
        lng: centerLng + NEIGHBORHOODS[0].offset[1],
      },
    });
    const last = days[days.length - 1];
    last.items.push({
      id: `${last.date}-depart`,
      time: "16:00",
      title: `Depart ${destination}`,
      description: "Allow extra buffer for airport transit.",
      category: "transit",
      location: {
        name: "Airport",
        lat: centerLat + 0.04,
        lng: centerLng - 0.05,
      },
    });
  }

  // Compute travel legs between consecutive items within each day.
  for (const day of days) {
    for (let i = 1; i < day.items.length; i++) {
      const prev = day.items[i - 1].location;
      const curr = day.items[i].location;
      if (!prev || !curr) continue;
      const meters = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
      day.items[i].legBefore = legFor(mode, meters);
    }
  }

  return days;
}
