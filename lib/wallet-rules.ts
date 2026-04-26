// Pure-JS parser logic — safe to import from server (Route Handlers) and from
// the client wallet lib alike. No browser APIs allowed in this file.

export type ConfirmationType =
  | "flight"
  | "hotel"
  | "car"
  | "restaurant"
  | "activity"
  | "train"
  | "cruise";

export type ParsedConfirmation = {
  id: string;
  type: ConfirmationType;
  title: string;
  vendor: string;
  reference: string;
  date: string;
  endDate?: string;
  time?: string;
  from?: string;
  to?: string;
  detail: string;
  totalUsd?: number;
  totalOriginal?: number;
  currency?: string;
  source: "auto-import" | "manual" | "ingest";
  createdAt: string;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  CAD: "C$",
  AUD: "A$",
  CHF: "CHF",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  MXN: "MX$",
  BRL: "R$",
  INR: "₹",
  KRW: "₩",
  SGD: "S$",
  HKD: "HK$",
  NZD: "NZ$",
  THB: "฿",
  ZAR: "R",
};

export const USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.07,
  GBP: 1.27,
  JPY: 0.0066,
  CNY: 0.14,
  CAD: 0.74,
  AUD: 0.66,
  CHF: 1.13,
  SEK: 0.094,
  NOK: 0.092,
  DKK: 0.144,
  MXN: 0.058,
  BRL: 0.2,
  INR: 0.012,
  KRW: 0.00074,
  SGD: 0.74,
  HKD: 0.128,
  NZD: 0.6,
  THB: 0.028,
  ZAR: 0.054,
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? "";
}

export function toUsd(amount: number, currency = "USD"): number {
  const rate = USD_RATES[currency] ?? 1;
  return Math.round(amount * rate * 100) / 100;
}

type VendorRule = {
  type: ConfirmationType;
  patterns: RegExp[];
  vendor: string;
};

const VENDOR_RULES: VendorRule[] = [
  // Airlines
  { type: "flight", vendor: "Delta", patterns: [/\bdelta\b/i, /delta\.com/i] },
  { type: "flight", vendor: "United", patterns: [/\bunited\b/i, /united\.com/i] },
  { type: "flight", vendor: "American", patterns: [/american airlines/i, /aa\.com/i] },
  { type: "flight", vendor: "JetBlue", patterns: [/\bjetblue\b/i] },
  { type: "flight", vendor: "Alaska", patterns: [/alaska airlines/i] },
  { type: "flight", vendor: "Southwest", patterns: [/southwest airlines/i] },
  { type: "flight", vendor: "Lufthansa", patterns: [/\blufthansa\b/i] },
  { type: "flight", vendor: "British Airways", patterns: [/british airways/i] },
  { type: "flight", vendor: "Air France", patterns: [/air france/i] },
  { type: "flight", vendor: "KLM", patterns: [/\bklm\b/i] },
  { type: "flight", vendor: "Emirates", patterns: [/\bemirates\b/i] },
  { type: "flight", vendor: "Qatar Airways", patterns: [/qatar airways/i] },
  { type: "flight", vendor: "Singapore Airlines", patterns: [/singapore airlines/i] },
  { type: "flight", vendor: "ANA", patterns: [/all nippon|\bana\b airways/i] },
  { type: "flight", vendor: "Japan Airlines", patterns: [/japan airlines|\bjal\b/i] },
  { type: "flight", vendor: "Cathay Pacific", patterns: [/cathay pacific/i] },
  { type: "flight", vendor: "Ryanair", patterns: [/\bryanair\b/i] },
  { type: "flight", vendor: "EasyJet", patterns: [/\beasyjet\b/i] },
  { type: "flight", vendor: "Airline", patterns: [/boarding pass|\bflight\b/i] },

  // Hotels
  { type: "hotel", vendor: "Marriott", patterns: [/\bmarriott\b/i] },
  { type: "hotel", vendor: "Hilton", patterns: [/\bhilton\b/i, /hilton honors/i] },
  { type: "hotel", vendor: "Hyatt", patterns: [/\bhyatt\b/i] },
  { type: "hotel", vendor: "IHG", patterns: [/\bihg\b/i, /intercontinental/i, /holiday inn/i] },
  { type: "hotel", vendor: "Four Seasons", patterns: [/four seasons/i] },
  { type: "hotel", vendor: "Ritz-Carlton", patterns: [/ritz[- ]carlton/i] },
  { type: "hotel", vendor: "Airbnb", patterns: [/\bairbnb\b/i] },
  { type: "hotel", vendor: "Vrbo", patterns: [/\bvrbo\b/i] },
  { type: "hotel", vendor: "Booking.com", patterns: [/booking\.com/i] },
  { type: "hotel", vendor: "Expedia", patterns: [/\bexpedia\b/i] },
  { type: "hotel", vendor: "Hotels.com", patterns: [/hotels\.com/i] },
  { type: "hotel", vendor: "Agoda", patterns: [/\bagoda\b/i] },
  { type: "hotel", vendor: "Hotel", patterns: [/check[- ]?in|reservation.*hotel|nights at/i] },

  // Cars
  { type: "car", vendor: "Hertz", patterns: [/\bhertz\b/i] },
  { type: "car", vendor: "Enterprise", patterns: [/\benterprise\b.*rent|rent.*\benterprise\b/i] },
  { type: "car", vendor: "Avis", patterns: [/\bavis\b/i] },
  { type: "car", vendor: "Sixt", patterns: [/\bsixt\b/i] },
  { type: "car", vendor: "Budget", patterns: [/budget rent/i] },
  { type: "car", vendor: "National", patterns: [/national car rental/i] },
  { type: "car", vendor: "Turo", patterns: [/\bturo\b/i] },
  { type: "car", vendor: "Rental car", patterns: [/rental car|car rental/i] },

  // Restaurants
  { type: "restaurant", vendor: "OpenTable", patterns: [/\bopentable\b/i] },
  { type: "restaurant", vendor: "Resy", patterns: [/\bresy\b/i] },
  { type: "restaurant", vendor: "Tock", patterns: [/exploretock|tockify|\btock\b/i] },
  { type: "restaurant", vendor: "Yelp Reservations", patterns: [/yelp.*reservation/i] },
  { type: "restaurant", vendor: "Restaurant", patterns: [/reservation at|table for \d|dining/i] },

  // Activities
  { type: "activity", vendor: "Viator", patterns: [/\bviator\b/i] },
  { type: "activity", vendor: "GetYourGuide", patterns: [/getyourguide/i] },
  { type: "activity", vendor: "Klook", patterns: [/\bklook\b/i] },
  { type: "activity", vendor: "Tiqets", patterns: [/\btiqets\b/i] },
  { type: "activity", vendor: "Headout", patterns: [/\bheadout\b/i] },
  { type: "activity", vendor: "Airbnb Experiences", patterns: [/airbnb experience/i] },
  { type: "activity", vendor: "Eventbrite", patterns: [/\beventbrite\b/i] },
  { type: "activity", vendor: "Ticketmaster", patterns: [/\bticketmaster\b/i] },
  { type: "activity", vendor: "StubHub", patterns: [/\bstubhub\b/i] },
  { type: "activity", vendor: "Activity", patterns: [/admission|tickets for|tour booking|skip[- ]the[- ]line/i] },

  // Trains
  { type: "train", vendor: "Amtrak", patterns: [/\bamtrak\b/i] },
  { type: "train", vendor: "Eurostar", patterns: [/\beurostar\b/i] },
  { type: "train", vendor: "Trenitalia", patterns: [/\btrenitalia\b/i] },
  { type: "train", vendor: "SNCF", patterns: [/\bsncf\b|tgv inoui|ouigo/i] },
  { type: "train", vendor: "Renfe", patterns: [/\brenfe\b/i] },
  { type: "train", vendor: "Deutsche Bahn", patterns: [/deutsche bahn|\bdb\b bahn/i] },
  { type: "train", vendor: "JR", patterns: [/japan rail|jr pass|shinkansen/i] },
  { type: "train", vendor: "Rail", patterns: [/\btrain\b|\brail\b ticket|\brailway\b/i] },

  // Cruises
  { type: "cruise", vendor: "Royal Caribbean", patterns: [/royal caribbean/i] },
  { type: "cruise", vendor: "Carnival", patterns: [/\bcarnival\b cruise/i] },
  { type: "cruise", vendor: "Norwegian", patterns: [/norwegian cruise/i] },
  { type: "cruise", vendor: "Cruise", patterns: [/\bcruise\b/i] },
];

const TYPE_TITLE: Record<ConfirmationType, string> = {
  flight: "Flight booked",
  hotel: "Stay booked",
  car: "Rental car",
  restaurant: "Reservation",
  activity: "Activity booked",
  train: "Train ticket",
  cruise: "Cruise booked",
};

function detectVendor(text: string) {
  for (const rule of VENDOR_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { type: rule.type, vendor: rule.vendor };
    }
  }
  return null;
}

function extractReference(text: string): string {
  const patterns = [
    /confirmation\s*(?:#|number|code|:)?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
    /booking\s*(?:#|number|reference|:)?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
    /reference\s*(?:#|:)?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
    /record locator[:\s]*([A-Z0-9]{5,})/i,
    /reservation\s*(?:#|:)?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
    /pnr[:\s]+([A-Z0-9]{5,})/i,
    /\b([A-Z]{2,}-?\d{3,}[A-Z0-9-]*)\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim().toUpperCase();
  }
  return `VYG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function parseDateSafe(s: string): string | null {
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function extractDates(text: string) {
  const isoDates = Array.from(text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)).map((m) => m[1]);
  const monthRe = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/g;
  const wordDates = Array.from(text.matchAll(monthRe))
    .map((m) => parseDateSafe(m[0]))
    .filter((d): d is string => !!d);
  const dates = [...isoDates, ...wordDates].sort();
  const date = dates[0] ?? new Date().toISOString().slice(0, 10);
  const endDate = dates.length > 1 && dates[dates.length - 1] !== date
    ? dates[dates.length - 1]
    : undefined;
  const timeMatch = text.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\b/);
  return { date, endDate, time: timeMatch?.[1]?.trim() };
}

function symbolToCurrency(sym: string): string {
  switch (sym) {
    case "$":
      return "USD";
    case "€":
      return "EUR";
    case "£":
      return "GBP";
    case "¥":
      return "JPY";
    case "₹":
      return "INR";
    case "₩":
      return "KRW";
    case "฿":
      return "THB";
    default:
      return "USD";
  }
}

function parseAmount(raw: string, currency: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) normalized = s.replace(/\./g, "").replace(",", ".");
    else normalized = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const after = s.slice(lastComma + 1);
    if (after.length === 2) normalized = s.replace(",", ".");
    else normalized = s.replace(/,/g, "");
  } else {
    normalized = s.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  if (isNaN(n)) return null;
  if (currency === "JPY" || currency === "KRW") return Math.round(n);
  return Math.round(n * 100) / 100;
}

function extractPrice(text: string) {
  const candidates: { amount: number; currency: string }[] = [];
  const symbolRe = /([$€£¥₹₩฿])\s?([\d,.]+)/g;
  for (const m of text.matchAll(symbolRe)) {
    const code = symbolToCurrency(m[1]);
    const amount = parseAmount(m[2], code);
    if (amount != null && amount > 0) candidates.push({ amount, currency: code });
  }
  const codeRe = /(?:^|\s)([A-Z]{3})\s?([\d,.]+)|([\d,.]+)\s?([A-Z]{3})\b/g;
  for (const m of text.matchAll(codeRe)) {
    const code = (m[1] ?? m[4])?.toUpperCase();
    const raw = m[2] ?? m[3];
    if (!code || !USD_RATES[code]) continue;
    const amount = parseAmount(raw, code);
    if (amount != null && amount > 0) candidates.push({ amount, currency: code });
  }

  if (candidates.length === 0) return {};

  const totalIdx = text.toLowerCase().lastIndexOf("total");
  let best = candidates[candidates.length - 1];
  if (totalIdx >= 0) {
    let bestDist = Infinity;
    for (const c of candidates) {
      const idx = text.indexOf(`${c.amount}`);
      const dist = Math.abs(idx - totalIdx);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
  } else {
    best = candidates.reduce((a, b) => (b.amount > a.amount ? b : a));
  }

  return {
    totalOriginal: best.amount,
    currency: best.currency,
    totalUsd: toUsd(best.amount, best.currency),
  };
}

function extractRoute(text: string, type: ConfirmationType) {
  if (type !== "flight" && type !== "train") return {};
  const re =
    /\b(?:from\s+)?([A-Z]{3})\s*(?:to|→|-{1,2}>|—)\s*([A-Z]{3})\b|\b([A-Z][a-zA-Z\s]+?)\s+to\s+([A-Z][a-zA-Z\s]+?)(?=\s|[\.,\n])/;
  const m = text.match(re);
  if (m) {
    return {
      from: (m[1] ?? m[3])?.trim(),
      to: (m[2] ?? m[4])?.trim(),
    };
  }
  return {};
}

export function parseEmailRaw(raw: string): ParsedConfirmation | null {
  const text = raw.trim();
  if (!text) return null;
  const detected = detectVendor(text);
  if (!detected) return null;
  const { type, vendor } = detected;
  const reference = extractReference(text);
  const { date, endDate, time } = extractDates(text);
  const price = extractPrice(text);
  const { from, to } = extractRoute(text, type);

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const subject = lines.find((l) => /^subject:/i.test(l))?.replace(/^subject:\s*/i, "");
  const baseTitle = subject ?? TYPE_TITLE[type];

  return {
    id: `conf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    title: baseTitle.slice(0, 80),
    vendor,
    reference,
    date,
    endDate,
    time,
    from,
    to,
    detail: lines.slice(0, 3).join(" — ").slice(0, 180),
    totalUsd: price.totalUsd,
    totalOriginal: price.totalOriginal,
    currency: price.currency,
    source: "auto-import",
    createdAt: new Date().toISOString(),
  };
}
