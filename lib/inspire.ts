// Lightweight rule-based parser to extract a destination + vibes from
// pasted text/URL. Real impl would call an LLM with vision for TikTok thumbnails.

const CITY_KEYWORDS: Record<string, string> = {
  tokyo: "Tokyo",
  kyoto: "Kyoto",
  osaka: "Osaka",
  paris: "Paris",
  lisbon: "Lisbon",
  porto: "Porto",
  rome: "Rome",
  florence: "Florence",
  venice: "Venice",
  barcelona: "Barcelona",
  madrid: "Madrid",
  london: "London",
  edinburgh: "Edinburgh",
  marrakech: "Marrakech",
  marrakesh: "Marrakech",
  reykjavik: "Reykjavík",
  iceland: "Reykjavík",
  "buenos aires": "Buenos Aires",
  "mexico city": "Mexico City",
  cdmx: "Mexico City",
  "new york": "New York",
  nyc: "New York",
  bangkok: "Bangkok",
  singapore: "Singapore",
  bali: "Bali",
  seoul: "Seoul",
  istanbul: "Istanbul",
  dubai: "Dubai",
  cairo: "Cairo",
  santorini: "Santorini",
  amsterdam: "Amsterdam",
  copenhagen: "Copenhagen",
  oslo: "Oslo",
  berlin: "Berlin",
  prague: "Prague",
  vienna: "Vienna",
  budapest: "Budapest",
  hanoi: "Hanoi",
  saigon: "Saigon",
};

const VIBE_KEYWORDS: Record<string, string[]> = {
  Food: ["food", "ramen", "sushi", "tacos", "pizza", "pho", "kebab", "wine", "tasting", "michelin", "café", "cafe", "coffee", "bakery", "dessert", "patisserie"],
  Culture: ["museum", "history", "old town", "art", "gallery", "ruins", "temple", "shrine", "cathedral", "castle"],
  Nature: ["hike", "mountain", "lake", "river", "waterfall", "forest", "national park", "trek", "valley", "geyser", "fjord", "glacier"],
  Beaches: ["beach", "swim", "snorkel", "ocean", "coastal", "island", "lagoon"],
  Nightlife: ["bar", "club", "speakeasy", "rooftop", "cocktail", "live music", "dj"],
  Adventure: ["surf", "ski", "kayak", "rafting", "climb", "scuba", "dive", "zipline"],
  Romantic: ["honeymoon", "sunset", "couple", "romantic", "anniversary"],
  Wellness: ["spa", "yoga", "thermal", "onsen", "retreat", "meditation"],
  Foodie: ["chef", "tasting menu", "omakase", "wine pairing", "market"],
  Family: ["kids", "family", "playground", "zoo", "aquarium"],
};

export type InspireResult = {
  destination: string | null;
  vibes: string[];
  detectedActivities: string[];
  raw: string;
};

export function parseInspiration(input: string): InspireResult {
  const text = input.trim();
  const lower = text.toLowerCase();

  let destination: string | null = null;
  for (const [k, v] of Object.entries(CITY_KEYWORDS)) {
    if (lower.includes(k)) {
      destination = v;
      break;
    }
  }

  const vibes: string[] = [];
  for (const [vibe, keywords] of Object.entries(VIBE_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      vibes.push(vibe);
    }
  }

  // Pull short noun-phrase looking activities — anything in quotes, or capitalized phrases.
  const detectedActivities: string[] = [];
  const quoted = text.match(/[“"']([^"'”]{3,40})[”"']/g);
  if (quoted) {
    for (const q of quoted) {
      detectedActivities.push(q.replace(/["“”']/g, "").trim());
    }
  }

  return {
    destination,
    vibes: vibes.slice(0, 4),
    detectedActivities: detectedActivities.slice(0, 5),
    raw: text,
  };
}
