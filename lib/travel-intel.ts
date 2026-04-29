// Travel intelligence — visa, weather, events, safety, plug + currency.
// Heuristic data for now; real APIs hook in via env vars.

export type Plug = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "I";

export type DestinationIntel = {
  country: string;
  currency: string;
  plug: Plug[];
  voltage: string;
  drivingSide: "left" | "right";
  tipNorm: string;
  tapWaterSafe: boolean;
  language: string[];
  emergency: string;
};

const COUNTRY_INTEL: Record<string, DestinationIntel> = {
  Japan: {
    country: "Japan",
    currency: "JPY",
    plug: ["A", "B"],
    voltage: "100V",
    drivingSide: "left",
    tipNorm: "No tipping — it can be insulting.",
    tapWaterSafe: true,
    language: ["Japanese"],
    emergency: "110 (police) · 119 (fire/ambulance)",
  },
  Portugal: {
    country: "Portugal",
    currency: "EUR",
    plug: ["C", "F"],
    voltage: "230V",
    drivingSide: "right",
    tipNorm: "10% in restaurants, round up taxis.",
    tapWaterSafe: true,
    language: ["Portuguese"],
    emergency: "112",
  },
  Mexico: {
    country: "Mexico",
    currency: "MXN",
    plug: ["A", "B"],
    voltage: "127V",
    drivingSide: "right",
    tipNorm: "10–15% in restaurants. Bottled water only.",
    tapWaterSafe: false,
    language: ["Spanish"],
    emergency: "911",
  },
  Iceland: {
    country: "Iceland",
    currency: "ISK",
    plug: ["C", "F"],
    voltage: "230V",
    drivingSide: "right",
    tipNorm: "Service usually included. Round up.",
    tapWaterSafe: true,
    language: ["Icelandic", "English"],
    emergency: "112",
  },
  Morocco: {
    country: "Morocco",
    currency: "MAD",
    plug: ["C", "E"],
    voltage: "220V",
    drivingSide: "right",
    tipNorm: "10% restaurants. Small tips for guides + porters.",
    tapWaterSafe: false,
    language: ["Arabic", "French"],
    emergency: "112 / 19 (police) · 15 (medical)",
  },
  Argentina: {
    country: "Argentina",
    currency: "ARS",
    plug: ["C", "I"],
    voltage: "220V",
    drivingSide: "right",
    tipNorm: "10% in restaurants. Cash usually preferred.",
    tapWaterSafe: true,
    language: ["Spanish"],
    emergency: "911",
  },
  France: {
    country: "France",
    currency: "EUR",
    plug: ["C", "E"],
    voltage: "230V",
    drivingSide: "right",
    tipNorm: "Service compris — round up if you loved it.",
    tapWaterSafe: true,
    language: ["French"],
    emergency: "112",
  },
  Italy: {
    country: "Italy",
    currency: "EUR",
    plug: ["C", "F", "L"],
    voltage: "230V",
    drivingSide: "right",
    tipNorm: "Coperto already added. Tip only if exceptional.",
    tapWaterSafe: true,
    language: ["Italian"],
    emergency: "112",
  } as DestinationIntel,
  "United Kingdom": {
    country: "United Kingdom",
    currency: "GBP",
    plug: ["G"],
    voltage: "230V",
    drivingSide: "left",
    tipNorm: "10–12.5% if not added.",
    tapWaterSafe: true,
    language: ["English"],
    emergency: "999 / 112",
  },
  "United States": {
    country: "United States",
    currency: "USD",
    plug: ["A", "B"],
    voltage: "120V",
    drivingSide: "right",
    tipNorm: "18–22% in restaurants, $1–2/drink at bars.",
    tapWaterSafe: true,
    language: ["English"],
    emergency: "911",
  },
};

const CITY_TO_COUNTRY: Record<string, string> = {
  Tokyo: "Japan",
  Kyoto: "Japan",
  Osaka: "Japan",
  Lisbon: "Portugal",
  Porto: "Portugal",
  "Mexico City": "Mexico",
  CDMX: "Mexico",
  Reykjavík: "Iceland",
  Reykjavik: "Iceland",
  Marrakech: "Morocco",
  Marrakesh: "Morocco",
  "Buenos Aires": "Argentina",
  Paris: "France",
  Rome: "Italy",
  Florence: "Italy",
  Venice: "Italy",
  London: "United Kingdom",
  Edinburgh: "United Kingdom",
  "New York": "United States",
  NYC: "United States",
};

export function intelForCity(city: string): DestinationIntel | null {
  const country = CITY_TO_COUNTRY[city] ?? city;
  return COUNTRY_INTEL[country] ?? null;
}

// ---------------- Visa / entry requirements ----------------

export type VisaRule = {
  passport: string;
  destination: string;
  status: "visa-free" | "eta" | "visa-required" | "visa-on-arrival";
  duration?: string;
  source: string;
  applicationUrl?: string;
  notes?: string;
};

// Hand-coded subset for the common pairs. Real impl would call Sherpa / IATA Timatic.
const VISA_MATRIX: VisaRule[] = [
  { passport: "US", destination: "Japan", status: "visa-free", duration: "90 days", source: "MOFA", notes: "Passport valid for stay." },
  { passport: "US", destination: "Portugal", status: "eta", duration: "90 days", source: "EU ETIAS", applicationUrl: "https://etias.com" },
  { passport: "US", destination: "France", status: "eta", duration: "90 days", source: "EU ETIAS", applicationUrl: "https://etias.com" },
  { passport: "US", destination: "Italy", status: "eta", duration: "90 days", source: "EU ETIAS" },
  { passport: "US", destination: "United Kingdom", status: "eta", duration: "180 days", source: "UK ETA", applicationUrl: "https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta" },
  { passport: "US", destination: "Mexico", status: "visa-free", duration: "180 days", source: "INM" },
  { passport: "US", destination: "Iceland", status: "eta", duration: "90 days", source: "EU ETIAS" },
  { passport: "US", destination: "Morocco", status: "visa-free", duration: "90 days", source: "MFAC" },
  { passport: "US", destination: "Argentina", status: "visa-free", duration: "90 days", source: "MIC" },
];

export function visaRule(passport: string, destinationCountry: string): VisaRule | null {
  const p = passport.toUpperCase();
  return (
    VISA_MATRIX.find(
      (r) =>
        r.passport === p && r.destination.toLowerCase() === destinationCountry.toLowerCase()
    ) ?? null
  );
}

// ---------------- Live data hooks ----------------
// These fall back to deterministic mocks until env vars are configured.

export type WeatherDay = {
  date: string;
  highC: number;
  lowC: number;
  conditions: string;
  precipMm: number;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function mockWeather(city: string, days: number): WeatherDay[] {
  const base = hash(city);
  const out: WeatherDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const seed = (base + i * 17) % 100;
    const high = 12 + (seed % 24);
    out.push({
      date: d.toISOString().slice(0, 10),
      highC: high,
      lowC: high - (5 + (seed % 8)),
      conditions:
        seed > 75 ? "Rain" : seed > 50 ? "Cloudy" : seed > 25 ? "Partly cloudy" : "Clear",
      precipMm: seed > 75 ? 6 + (seed % 15) : seed > 60 ? 1 : 0,
    });
  }
  return out;
}

export type LocalEvent = {
  title: string;
  date: string;
  category: "concert" | "sport" | "festival" | "exhibit";
  venue: string;
};

export function mockEvents(city: string): LocalEvent[] {
  const base = hash(city);
  const samples = [
    { title: "Symphony at city hall", category: "concert" as const },
    { title: "Local football derby", category: "sport" as const },
    { title: "Modern photography exhibit", category: "exhibit" as const },
    { title: "Street food festival", category: "festival" as const },
    { title: "Indie band live", category: "concert" as const },
  ];
  return samples.map((s, i) => {
    const d = new Date();
    d.setDate(d.getDate() + ((base + i * 7) % 14) + 1);
    return {
      title: s.title,
      date: d.toISOString().slice(0, 10),
      category: s.category,
      venue: ["Main Square", "Old Theatre", "Riverside Hall", "Civic Center"][
        (base + i) % 4
      ],
    };
  });
}

export type SafetyAdvisory = {
  level: 1 | 2 | 3 | 4;
  summary: string;
  source: string;
};

export function mockSafety(country: string): SafetyAdvisory {
  const seed = hash(country) % 10;
  if (seed < 6) {
    return {
      level: 1,
      summary: "Exercise normal precautions.",
      source: "US State Department",
    };
  }
  if (seed < 9) {
    return {
      level: 2,
      summary: "Exercise increased caution.",
      source: "US State Department",
    };
  }
  return {
    level: 3,
    summary: "Reconsider travel.",
    source: "US State Department",
  };
}
