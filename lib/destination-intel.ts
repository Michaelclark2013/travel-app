"use client";

// Destination Intel — curated "know before you go" data for common
// destinations, plus a graceful generic fallback for anything else.
// Built around US-citizen baseline assumptions; tweak via the user's
// home country in a future iteration.

export type Severity = "info" | "good" | "warn" | "alert";

export type Phrase = { en: string; local: string; pron?: string };

export type CountryIntel = {
  /** Country code (ISO-3166 alpha-2) */
  code: string;
  country: string;
  /** Local currency. */
  currency: { code: string; symbol: string };
  language: string;
  callingCode: string;
  emergencyNumber: string;
  policeNumber?: string;
  ambulanceNumber?: string;
  embassyUrl?: string;

  // Entry
  /** Visa info specifically for US citizens. */
  visa: {
    required: boolean;
    /** "ETA", "evisa", "visa-on-arrival", "no-visa", "embassy-visa" */
    type: string;
    /** Length of stay allowed without a long-stay visa. */
    stayDays?: number;
    /** Notes shown to user. */
    notes: string;
    /** Online entry portal, if any. */
    portalUrl?: string;
  };
  /** Passport validity required (months from entry). */
  passportValidityMonths: number;
  vaccinations?: string;
  travelAdvisory?: { level: 1 | 2 | 3 | 4; notes: string };

  // Practical
  plug: string; // e.g. "Type A/B" or "Type G"
  voltage: string;
  drivingSide: "left" | "right";
  tapWaterSafe: boolean;

  // Tipping
  tipping: {
    restaurants: string;
    taxis: string;
    hotels: string;
  };

  // Phrases
  phrases?: Phrase[];

  // Culture
  culture?: string[]; // dress / etiquette norms
  scams?: string[];

  // Logistics
  airportToCity?: string;
  transitPass?: string;
  averageCosts?: { meal?: string; coffee?: string; metro?: string; taxi?: string };

  // Health
  healthRisks?: string[];
};

const PHRASES = {
  english: [
    { en: "Hello", local: "Hello" },
    { en: "Thank you", local: "Thank you" },
    { en: "Excuse me", local: "Excuse me" },
    { en: "Where is…?", local: "Where is…?" },
    { en: "How much?", local: "How much?" },
  ] as Phrase[],
};

export const COUNTRY_INTEL: Record<string, CountryIntel> = {
  JP: {
    code: "JP",
    country: "Japan",
    currency: { code: "JPY", symbol: "¥" },
    language: "Japanese",
    callingCode: "+81",
    emergencyNumber: "110 / 119",
    policeNumber: "110",
    ambulanceNumber: "119",
    embassyUrl: "https://jp.usembassy.gov/",
    visa: {
      required: false,
      type: "no-visa",
      stayDays: 90,
      notes:
        "Visa-free stay up to 90 days for tourism. Register on Visit Japan Web before arrival to speed up immigration + customs.",
      portalUrl: "https://vjw-lp.digital.go.jp/en/",
    },
    passportValidityMonths: 0,
    travelAdvisory: { level: 1, notes: "Exercise normal precautions." },
    plug: "Type A / B",
    voltage: "100V / 50–60Hz",
    drivingSide: "left",
    tapWaterSafe: true,
    tipping: {
      restaurants: "No tipping — sometimes considered rude. Service is included.",
      taxis: "No tipping.",
      hotels: "No tipping. Bellhops bow, you bow back.",
    },
    phrases: [
      { en: "Hello", local: "こんにちは", pron: "konnichiwa" },
      { en: "Thank you", local: "ありがとう", pron: "arigatou" },
      { en: "Excuse me", local: "すみません", pron: "sumimasen" },
      { en: "Where is…?", local: "…はどこですか", pron: "…wa doko desu ka" },
      { en: "How much?", local: "いくらですか", pron: "ikura desu ka" },
    ],
    culture: [
      "Remove shoes when entering homes, ryokan, and many traditional restaurants.",
      "Don't eat while walking on the street outside designated stalls.",
      "Bowing is a normal greeting — slight nod for casual, deeper for formal.",
      "Keep voices low on trains; phone calls are a faux pas.",
    ],
    scams: ["Touts in Roppongi / Shinjuku — avoid bars they pull you into."],
    airportToCity:
      "Narita Express or Skyliner from Narita; Limousine bus or Yamanote from Haneda.",
    transitPass: "Suica or PASMO IC card — works on trains, buses, vending machines.",
    averageCosts: {
      meal: "$8–15",
      coffee: "$3–5",
      metro: "$2–3",
      taxi: "$8 base + $1.50/km",
    },
    healthRisks: ["Pollen season Feb–May", "Heat / humidity in summer"],
  },

  GB: {
    code: "GB",
    country: "United Kingdom",
    currency: { code: "GBP", symbol: "£" },
    language: "English",
    callingCode: "+44",
    emergencyNumber: "999 (or 112)",
    embassyUrl: "https://uk.usembassy.gov/",
    visa: {
      required: true,
      type: "ETA",
      stayDays: 180,
      notes:
        "From 2025, US citizens need an Electronic Travel Authorization (ETA) before arrival. £10, valid 2 years.",
      portalUrl: "https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta",
    },
    passportValidityMonths: 0,
    travelAdvisory: { level: 2, notes: "Exercise increased caution due to terrorism risk." },
    plug: "Type G",
    voltage: "230V / 50Hz",
    drivingSide: "left",
    tapWaterSafe: true,
    tipping: {
      restaurants: "10–12.5% if service charge isn't already added.",
      taxis: "Round up the fare.",
      hotels: "£1–2 per bag for porters, £1–2 per night for housekeeping.",
    },
    phrases: PHRASES.english,
    culture: [
      "Queue politely — cutting is a serious offense.",
      "Pubs: order at the bar, no table service for drinks.",
    ],
    airportToCity:
      "Heathrow Express, Elizabeth Line, or Piccadilly Tube from LHR; Gatwick Express from LGW.",
    transitPass: "Oyster card or contactless bank card — caps at daily max.",
    averageCosts: {
      meal: "£12–20",
      coffee: "£3–4",
      metro: "£2.80",
      taxi: "£3 base + £2/km",
    },
  },

  FR: {
    code: "FR",
    country: "France",
    currency: { code: "EUR", symbol: "€" },
    language: "French",
    callingCode: "+33",
    emergencyNumber: "112",
    embassyUrl: "https://fr.usembassy.gov/",
    visa: {
      required: false,
      type: "no-visa",
      stayDays: 90,
      notes:
        "Visa-free Schengen stay up to 90 days in any 180-day period. ETIAS pre-authorization expected to launch in 2025.",
      portalUrl: "https://travel-europe.europa.eu/etias_en",
    },
    passportValidityMonths: 3,
    travelAdvisory: { level: 2, notes: "Exercise increased caution due to terrorism + civil unrest." },
    plug: "Type C / E",
    voltage: "230V / 50Hz",
    drivingSide: "right",
    tapWaterSafe: true,
    tipping: {
      restaurants: "Service compris — round up €1–5 if you liked it.",
      taxis: "Round up the fare.",
      hotels: "€1–2 per bag.",
    },
    phrases: [
      { en: "Hello", local: "Bonjour", pron: "bohn-zhoor" },
      { en: "Thank you", local: "Merci", pron: "mehr-see" },
      { en: "Excuse me", local: "Excusez-moi", pron: "ex-koo-zay mwah" },
      { en: "Where is…?", local: "Où est…?", pron: "oo eh" },
      { en: "How much?", local: "Combien?", pron: "kohm-byan" },
    ],
    culture: [
      "Greet shopkeepers with 'Bonjour' as you enter.",
      "Smart-casual is the default — avoid loud athleisure outside the gym.",
    ],
    scams: [
      "Petition / ring scams near tourist sites in Paris.",
      "Pickpockets on Metro line 1 + around Sacré-Cœur.",
    ],
    airportToCity: "RER B from CDG. Avoid unmarked taxis at the curb.",
    transitPass: "Navigo Easy card for Paris Metro / RER.",
    averageCosts: { meal: "€15–25", coffee: "€2–4", metro: "€2.10", taxi: "€7 base + €1.30/km" },
  },

  IT: {
    code: "IT",
    country: "Italy",
    currency: { code: "EUR", symbol: "€" },
    language: "Italian",
    callingCode: "+39",
    emergencyNumber: "112",
    embassyUrl: "https://it.usembassy.gov/",
    visa: {
      required: false,
      type: "no-visa",
      stayDays: 90,
      notes:
        "Visa-free Schengen stay up to 90 days in any 180-day period.",
    },
    passportValidityMonths: 3,
    travelAdvisory: { level: 2, notes: "Exercise increased caution." },
    plug: "Type C / F / L",
    voltage: "230V / 50Hz",
    drivingSide: "right",
    tapWaterSafe: true,
    tipping: {
      restaurants: "Coperto + servizio often included — €1–2 if exceptional.",
      taxis: "Round up.",
      hotels: "€1–2 per bag.",
    },
    phrases: [
      { en: "Hello", local: "Ciao / Buongiorno", pron: "chow / bwon-jorno" },
      { en: "Thank you", local: "Grazie", pron: "graht-see-eh" },
      { en: "Excuse me", local: "Scusi", pron: "skoo-zee" },
      { en: "Where is…?", local: "Dov'è…?", pron: "doh-veh" },
      { en: "How much?", local: "Quanto costa?", pron: "kwan-toh kos-tah" },
    ],
    culture: [
      "Cover shoulders + knees inside churches.",
      "Cappuccino after 11am is unusual.",
    ],
    scams: ["'Free' bracelets near Colosseum + Spanish Steps."],
    airportToCity: "Leonardo Express from FCO to Termini in 32 min.",
    transitPass: "Roma Pass — covers transit + entry to first 2 sites.",
    averageCosts: { meal: "€15–25", coffee: "€1–2", metro: "€1.50", taxi: "€3 base + €1.10/km" },
  },

  ES: {
    code: "ES",
    country: "Spain",
    currency: { code: "EUR", symbol: "€" },
    language: "Spanish",
    callingCode: "+34",
    emergencyNumber: "112",
    embassyUrl: "https://es.usembassy.gov/",
    visa: {
      required: false,
      type: "no-visa",
      stayDays: 90,
      notes: "Visa-free Schengen stay up to 90 days in 180.",
    },
    passportValidityMonths: 3,
    plug: "Type C / F",
    voltage: "230V / 50Hz",
    drivingSide: "right",
    tapWaterSafe: true,
    tipping: {
      restaurants: "5–10% if no service charge.",
      taxis: "Round up.",
      hotels: "€1–2 per bag.",
    },
    phrases: [
      { en: "Hello", local: "Hola", pron: "oh-la" },
      { en: "Thank you", local: "Gracias", pron: "grah-see-as" },
      { en: "Excuse me", local: "Disculpe", pron: "dees-kool-peh" },
      { en: "Where is…?", local: "¿Dónde está…?", pron: "don-deh es-tah" },
      { en: "How much?", local: "¿Cuánto cuesta?", pron: "kwan-toh kwes-tah" },
    ],
    culture: ["Lunch is 2–4pm, dinner is 9–11pm."],
    averageCosts: { meal: "€12–20", coffee: "€1.50", metro: "€2.40", taxi: "€2.50 base" },
  },

  MX: {
    code: "MX",
    country: "Mexico",
    currency: { code: "MXN", symbol: "MX$" },
    language: "Spanish",
    callingCode: "+52",
    emergencyNumber: "911",
    embassyUrl: "https://mx.usembassy.gov/",
    visa: {
      required: false,
      type: "no-visa",
      stayDays: 180,
      notes: "Visa-free for tourism up to 180 days. Forma Migratoria Múltiple (FMM) issued at entry.",
    },
    passportValidityMonths: 6,
    travelAdvisory: { level: 3, notes: "Reconsider travel — varies by state, check the State Department list." },
    plug: "Type A / B",
    voltage: "127V / 60Hz",
    drivingSide: "right",
    tapWaterSafe: false,
    tipping: {
      restaurants: "10–15%.",
      taxis: "Not expected; round up.",
      hotels: "$1–2 USD per bag.",
    },
    phrases: [
      { en: "Hello", local: "Hola" },
      { en: "Thank you", local: "Gracias" },
      { en: "Excuse me", local: "Permiso / Disculpe" },
      { en: "Where is…?", local: "¿Dónde está…?" },
      { en: "How much?", local: "¿Cuánto cuesta?" },
    ],
    healthRisks: ["Don't drink tap water — bottled or filtered only.", "Mosquitoes in coastal areas."],
    averageCosts: { meal: "$5–12", coffee: "$2", taxi: "$1.50 base" },
  },

  TH: {
    code: "TH",
    country: "Thailand",
    currency: { code: "THB", symbol: "฿" },
    language: "Thai",
    callingCode: "+66",
    emergencyNumber: "191 / 1669",
    embassyUrl: "https://th.usembassy.gov/",
    visa: {
      required: false,
      type: "no-visa",
      stayDays: 60,
      notes: "Visa exemption up to 60 days as of 2024 for US passports.",
    },
    passportValidityMonths: 6,
    travelAdvisory: { level: 2, notes: "Exercise increased caution." },
    plug: "Type A / B / C",
    voltage: "230V / 50Hz",
    drivingSide: "left",
    tapWaterSafe: false,
    tipping: { restaurants: "10% or round up.", taxis: "Round up.", hotels: "20–50 THB per bag." },
    culture: [
      "Don't touch anyone's head.",
      "Remove shoes when entering temples + many homes.",
      "Cover shoulders + knees at temples.",
    ],
    healthRisks: ["Mosquito-borne illness", "Don't drink tap water"],
    airportToCity: "Airport Rail Link or metered taxi from BKK.",
  },

  US: {
    code: "US",
    country: "United States",
    currency: { code: "USD", symbol: "$" },
    language: "English",
    callingCode: "+1",
    emergencyNumber: "911",
    visa: {
      required: false,
      type: "domestic",
      notes: "No visa needed for US citizens. State ID or REAL ID required for domestic flights from May 2025.",
    },
    passportValidityMonths: 0,
    plug: "Type A / B",
    voltage: "120V / 60Hz",
    drivingSide: "right",
    tapWaterSafe: true,
    tipping: {
      restaurants: "18–22% standard, 15% baseline.",
      taxis: "15–20%.",
      hotels: "$1–2 per bag, $2–5 per night for housekeeping.",
    },
    phrases: PHRASES.english,
  },

  CA: {
    code: "CA",
    country: "Canada",
    currency: { code: "CAD", symbol: "C$" },
    language: "English / French",
    callingCode: "+1",
    emergencyNumber: "911",
    visa: {
      required: true,
      type: "ETA",
      stayDays: 180,
      notes: "US citizens flying into Canada need a valid passport. eTA only for visa-required nationalities.",
    },
    passportValidityMonths: 0,
    plug: "Type A / B",
    voltage: "120V / 60Hz",
    drivingSide: "right",
    tapWaterSafe: true,
    tipping: {
      restaurants: "15–20%.",
      taxis: "10–15%.",
      hotels: "C$1–2 per bag.",
    },
    phrases: PHRASES.english,
  },
};

// Mapping of city / region keywords → country code.
const CITY_TO_CODE: { match: RegExp; code: string }[] = [
  { match: /tokyo|kyoto|osaka|japan|hokkaido|okinawa/i, code: "JP" },
  { match: /london|edinburgh|manchester|england|scotland|uk|britain/i, code: "GB" },
  { match: /paris|nice|lyon|marseille|france|bordeaux/i, code: "FR" },
  { match: /rome|milan|florence|venice|naples|italy/i, code: "IT" },
  { match: /madrid|barcelona|seville|spain/i, code: "ES" },
  { match: /mexico|cdmx|cancun|tulum|cabo|guadalajara/i, code: "MX" },
  { match: /bangkok|chiang mai|phuket|thailand|krabi/i, code: "TH" },
  { match: /toronto|vancouver|montreal|canada|quebec/i, code: "CA" },
  {
    match:
      /new york|nyc|los angeles|san francisco|sfo|seattle|miami|chicago|boston|austin|nashville|hawaii|usa|united states/i,
    code: "US",
  },
];

export function resolveCountry(destination?: string): CountryIntel | null {
  if (!destination) return null;
  const found = CITY_TO_CODE.find((e) => e.match.test(destination));
  if (!found) return null;
  return COUNTRY_INTEL[found.code] ?? null;
}

// Generic fallback — used when destination doesn't match a curated entry.
export function genericIntel(destination: string): CountryIntel {
  return {
    code: "??",
    country: destination,
    currency: { code: "USD", symbol: "$" },
    language: "—",
    callingCode: "—",
    emergencyNumber: "112 (most countries) / 911 (Americas)",
    visa: {
      required: true,
      type: "check-required",
      notes:
        "Curated visa data isn't available for this destination yet. Check travel.state.gov before booking.",
      portalUrl: "https://travel.state.gov/content/travel/en/international-travel.html",
    },
    passportValidityMonths: 6,
    plug: "Check before packing — adapter recommended",
    voltage: "—",
    drivingSide: "right",
    tapWaterSafe: false,
    tipping: { restaurants: "Check local norms.", taxis: "Round up.", hotels: "$1–2 per bag." },
  };
}

// ----- Practical helpers -----

export function timeZoneOffsetSummary(): string {
  const offset = -new Date().getTimezoneOffset() / 60;
  return offset >= 0 ? `+${offset}` : `${offset}`;
}
