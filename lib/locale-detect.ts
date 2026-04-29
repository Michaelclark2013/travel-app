"use client";

// Auto-detect the user's home city + currency from the browser. Used once on
// first visit to pre-fill "Starting from" and the currency converter so a
// London user doesn't have to type "London."

const TIMEZONE_TO_CITY: Record<string, { city: string; currency: string }> = {
  "America/New_York": { city: "New York", currency: "USD" },
  "America/Los_Angeles": { city: "Los Angeles", currency: "USD" },
  "America/Chicago": { city: "Chicago", currency: "USD" },
  "America/Denver": { city: "Denver", currency: "USD" },
  "America/Phoenix": { city: "Phoenix", currency: "USD" },
  "America/Toronto": { city: "Toronto", currency: "CAD" },
  "America/Vancouver": { city: "Vancouver", currency: "CAD" },
  "America/Mexico_City": { city: "Mexico City", currency: "MXN" },
  "America/Sao_Paulo": { city: "São Paulo", currency: "BRL" },
  "America/Buenos_Aires": { city: "Buenos Aires", currency: "ARS" },
  "Europe/London": { city: "London", currency: "GBP" },
  "Europe/Dublin": { city: "Dublin", currency: "EUR" },
  "Europe/Paris": { city: "Paris", currency: "EUR" },
  "Europe/Berlin": { city: "Berlin", currency: "EUR" },
  "Europe/Madrid": { city: "Madrid", currency: "EUR" },
  "Europe/Lisbon": { city: "Lisbon", currency: "EUR" },
  "Europe/Rome": { city: "Rome", currency: "EUR" },
  "Europe/Amsterdam": { city: "Amsterdam", currency: "EUR" },
  "Europe/Zurich": { city: "Zurich", currency: "CHF" },
  "Europe/Stockholm": { city: "Stockholm", currency: "SEK" },
  "Europe/Athens": { city: "Athens", currency: "EUR" },
  "Europe/Istanbul": { city: "Istanbul", currency: "TRY" },
  "Europe/Moscow": { city: "Moscow", currency: "RUB" },
  "Asia/Tokyo": { city: "Tokyo", currency: "JPY" },
  "Asia/Seoul": { city: "Seoul", currency: "KRW" },
  "Asia/Shanghai": { city: "Shanghai", currency: "CNY" },
  "Asia/Hong_Kong": { city: "Hong Kong", currency: "HKD" },
  "Asia/Singapore": { city: "Singapore", currency: "SGD" },
  "Asia/Bangkok": { city: "Bangkok", currency: "THB" },
  "Asia/Kolkata": { city: "Mumbai", currency: "INR" },
  "Asia/Dubai": { city: "Dubai", currency: "AED" },
  "Australia/Sydney": { city: "Sydney", currency: "AUD" },
  "Australia/Melbourne": { city: "Melbourne", currency: "AUD" },
  "Pacific/Auckland": { city: "Auckland", currency: "NZD" },
  "Africa/Johannesburg": { city: "Johannesburg", currency: "ZAR" },
  "Africa/Cairo": { city: "Cairo", currency: "EGP" },
  "Africa/Lagos": { city: "Lagos", currency: "NGN" },
};

export type LocaleHint = {
  city: string;
  currency: string;
  timezone: string;
};

export function detectLocale(): LocaleHint | null {
  if (typeof Intl === "undefined") return null;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hit = TIMEZONE_TO_CITY[tz];
    if (hit) return { ...hit, timezone: tz };
    // Fallback: parse the timezone for a city ("Continent/City" → City)
    const tail = tz?.split("/").pop();
    if (tail) {
      return {
        city: tail.replace(/_/g, " "),
        currency: "USD",
        timezone: tz,
      };
    }
  } catch {}
  return null;
}
