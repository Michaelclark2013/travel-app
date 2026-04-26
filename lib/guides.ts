export type Guide = {
  id: string;
  title: string;
  city: string;
  author: string;
  authorHandle: string;
  authorAvatarSeed: number;
  rating: number;
  reviews: number;
  priceUsd: number;
  durationDays: number;
  blurb: string;
  highlights: string[];
  tags: string[];
};

// Curated mock guides — represents creator marketplace inventory.
export const GUIDES: Guide[] = [
  {
    id: "g-tokyo-coffee",
    title: "Tokyo on Coffee",
    city: "Tokyo",
    author: "Lia Park",
    authorHandle: "@lia.brews",
    authorAvatarSeed: 41,
    rating: 4.9,
    reviews: 312,
    priceUsd: 9,
    durationDays: 3,
    blurb:
      "Three days through Tokyo's third-wave coffee scene — Daikanyama, Kuramae, Shimokita.",
    highlights: [
      "12 hand-picked cafés, ranked by morning energy",
      "Walking routes between every stop",
      "Two pastry shops worth the detour",
    ],
    tags: ["Food", "Culture", "Solo"],
  },
  {
    id: "g-lisbon-locals",
    title: "Lisbon Like a Local",
    city: "Lisbon",
    author: "Diogo Marques",
    authorHandle: "@diogo.lx",
    authorAvatarSeed: 88,
    rating: 4.8,
    reviews: 521,
    priceUsd: 12,
    durationDays: 4,
    blurb:
      "Beyond Alfama: my favorite tascas, miradouros, and a hidden vinyl bar in Marvila.",
    highlights: [
      "5 family-run restaurants tourists never find",
      "Sunset viewpoint walking order",
      "Day trip to Sintra without the crowds",
    ],
    tags: ["Food", "Culture", "Romantic"],
  },
  {
    id: "g-mexcity-art",
    title: "Mexico City for Art Lovers",
    city: "Mexico City",
    author: "Amelia Cruz",
    authorHandle: "@amelia.cdmx",
    authorAvatarSeed: 14,
    rating: 4.9,
    reviews: 198,
    priceUsd: 14,
    durationDays: 5,
    blurb:
      "Galleries, mural walks, and the ceramics studios you book a year ahead.",
    highlights: [
      "Roma & Condesa gallery itinerary",
      "Frida + Diego pairing in one perfect day",
      "Three artisan studio tours",
    ],
    tags: ["Culture", "Art", "Foodie"],
  },
  {
    id: "g-iceland-rings",
    title: "Iceland Ring Road in 8 Days",
    city: "Reykjavík",
    author: "Sigrún Jónsson",
    authorHandle: "@sig.iceland",
    authorAvatarSeed: 220,
    rating: 4.7,
    reviews: 740,
    priceUsd: 19,
    durationDays: 8,
    blurb:
      "Daily mileage, hot pools that aren't on the map, and where to refuel before glacier days.",
    highlights: [
      "Day-by-day driving plan with weather buffer",
      "12 hot springs, ranked by remoteness",
      "Aurora-chase decision tree",
    ],
    tags: ["Adventure", "Nature", "Wellness"],
  },
  {
    id: "g-marrakech-souks",
    title: "Marrakech Souks Without the Headache",
    city: "Marrakech",
    author: "Hassan Belkadi",
    authorHandle: "@hassan.medina",
    authorAvatarSeed: 137,
    rating: 4.8,
    reviews: 412,
    priceUsd: 8,
    durationDays: 3,
    blurb:
      "How to actually navigate the souks, what to buy where, and the riads worth the splurge.",
    highlights: [
      "Color-coded market map",
      "Bargain price benchmarks",
      "Five rooftop sundowners ranked",
    ],
    tags: ["Culture", "Food"],
  },
  {
    id: "g-buenos-steak",
    title: "Buenos Aires: Tango & Steak",
    city: "Buenos Aires",
    author: "Pablo Reyes",
    authorHandle: "@pablo.tango",
    authorAvatarSeed: 173,
    rating: 4.9,
    reviews: 281,
    priceUsd: 11,
    durationDays: 6,
    blurb:
      "Late nights, long lunches, and milongas you can attend as a beginner.",
    highlights: [
      "Eight parrillas worth the queue",
      "Beginner-friendly milonga schedule",
      "Day trip to Tigre",
    ],
    tags: ["Food", "Nightlife", "Romantic"],
  },
];

export function findGuide(id: string) {
  return GUIDES.find((g) => g.id === id);
}
