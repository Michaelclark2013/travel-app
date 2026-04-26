// Server-side Amadeus client. Use only from API routes — never the browser,
// because the API secret must stay private.
//
// Sign up: https://developers.amadeus.com (free Self-Service tier covers ~2,000
// calls/month). Set AMADEUS_API_KEY and AMADEUS_API_SECRET on Vercel.

const TOKEN_URL = "https://test.api.amadeus.com/v1/security/oauth2/token";
const FLIGHT_URL = "https://test.api.amadeus.com/v2/shopping/flight-offers";
const HOTEL_LIST_URL =
  "https://test.api.amadeus.com/v1/reference-data/locations/hotels/by-city";
const HOTEL_OFFERS_URL = "https://test.api.amadeus.com/v3/shopping/hotel-offers";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function amadeusEnabled(): boolean {
  return !!(process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET);
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const apiKey = process.env.AMADEUS_API_KEY!;
  const apiSecret = process.env.AMADEUS_API_SECRET!;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: apiKey,
      client_secret: apiSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus auth failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

// City code lookup — Amadeus needs IATA codes (e.g., NYC, TYO, LIS, MEX).
const CITY_TO_IATA: Record<string, string> = {
  "new york": "NYC",
  nyc: "NYC",
  "los angeles": "LAX",
  "san francisco": "SFO",
  chicago: "CHI",
  miami: "MIA",
  boston: "BOS",
  seattle: "SEA",
  tokyo: "TYO",
  kyoto: "OSA",
  osaka: "OSA",
  paris: "PAR",
  london: "LON",
  rome: "ROM",
  barcelona: "BCN",
  madrid: "MAD",
  lisbon: "LIS",
  porto: "OPO",
  amsterdam: "AMS",
  berlin: "BER",
  dubai: "DXB",
  singapore: "SIN",
  bangkok: "BKK",
  seoul: "SEL",
  istanbul: "IST",
  cairo: "CAI",
  marrakech: "RAK",
  marrakesh: "RAK",
  reykjavik: "REK",
  "reykjavík": "REK",
  "buenos aires": "BUE",
  "mexico city": "MEX",
  cdmx: "MEX",
};

export function toIata(input: string): string {
  const trimmed = input.trim();
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
  const found = CITY_TO_IATA[trimmed.toLowerCase()];
  return found ?? trimmed.slice(0, 3).toUpperCase();
}

export type AmadeusFlight = {
  id: string;
  airline: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  durationMinutes: number;
  stops: number;
  price: number;
};

function isoDurationToMinutes(iso: string): number {
  // PT2H30M / PT4H / PT45M
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  const [, h, m] = match;
  return Number(h ?? 0) * 60 + Number(m ?? 0);
}

function timeOnly(iso: string): string {
  const t = iso.split("T")[1] ?? "";
  return t.slice(0, 5);
}

export async function searchFlights(opts: {
  from: string;
  to: string;
  date: string;
  travelers?: number;
  max?: number;
}): Promise<AmadeusFlight[]> {
  const token = await getToken();
  const params = new URLSearchParams({
    originLocationCode: toIata(opts.from),
    destinationLocationCode: toIata(opts.to),
    departureDate: opts.date,
    adults: String(opts.travelers ?? 1),
    currencyCode: "USD",
    max: String(opts.max ?? 10),
  });
  const res = await fetch(`${FLIGHT_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Amadeus flights failed: ${res.status}`);
  }
  const json = (await res.json()) as { data?: AmadeusOffer[] };
  return (json.data ?? []).map((offer) => offerToFlight(offer)).filter(Boolean) as AmadeusFlight[];
}

type AmadeusOffer = {
  id: string;
  price: { total: string };
  itineraries: {
    duration: string;
    segments: {
      departure: { iataCode: string; at: string };
      arrival: { iataCode: string; at: string };
      carrierCode: string;
    }[];
  }[];
  validatingAirlineCodes?: string[];
};

function offerToFlight(offer: AmadeusOffer): AmadeusFlight | null {
  const itin = offer.itineraries?.[0];
  if (!itin) return null;
  const segs = itin.segments;
  const first = segs[0];
  const last = segs[segs.length - 1];
  return {
    id: offer.id,
    airline: offer.validatingAirlineCodes?.[0] ?? first.carrierCode,
    from: first.departure.iataCode,
    to: last.arrival.iataCode,
    departTime: timeOnly(first.departure.at),
    arriveTime: timeOnly(last.arrival.at),
    durationMinutes: isoDurationToMinutes(itin.duration),
    stops: Math.max(0, segs.length - 1),
    price: Math.round(parseFloat(offer.price.total)),
  };
}

// ---------------- Hotels ----------------

export type AmadeusHotel = {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviews: number;
  pricePerNight: number;
  amenities: string[];
  imageHue: number;
};

export async function searchHotels(opts: {
  city: string;
  checkIn: string;
  checkOut: string;
  travelers?: number;
}): Promise<AmadeusHotel[]> {
  const token = await getToken();
  const cityCode = toIata(opts.city);

  // Step 1: list hotels in the city.
  const listRes = await fetch(
    `${HOTEL_LIST_URL}?${new URLSearchParams({ cityCode })}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!listRes.ok) {
    throw new Error(`Amadeus hotel list failed: ${listRes.status}`);
  }
  const listJson = (await listRes.json()) as {
    data?: { hotelId: string; name: string }[];
  };
  const hotelIds = (listJson.data ?? []).slice(0, 12).map((h) => h.hotelId);
  if (hotelIds.length === 0) return [];

  // Step 2: pull offers for those hotels.
  const offersParams = new URLSearchParams({
    hotelIds: hotelIds.join(","),
    checkInDate: opts.checkIn,
    checkOutDate: opts.checkOut,
    adults: String(opts.travelers ?? 1),
    currency: "USD",
  });
  const offersRes = await fetch(`${HOTEL_OFFERS_URL}?${offersParams}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!offersRes.ok) {
    throw new Error(`Amadeus hotel offers failed: ${offersRes.status}`);
  }
  const offersJson = (await offersRes.json()) as {
    data?: {
      hotel: { hotelId: string; name: string; rating?: string; cityCode?: string };
      offers?: { price: { total: string } }[];
    }[];
  };

  return (offersJson.data ?? [])
    .map((d, i) => {
      const cheapest = d.offers?.[0];
      if (!cheapest) return null;
      const nights = Math.max(
        1,
        Math.round(
          (new Date(opts.checkOut).getTime() - new Date(opts.checkIn).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
      const total = parseFloat(cheapest.price.total);
      return {
        id: d.hotel.hotelId,
        name: d.hotel.name,
        city: d.hotel.cityCode ?? cityCode,
        rating: d.hotel.rating ? Number(d.hotel.rating) : 4.2,
        reviews: 200 + ((i * 137) % 4000),
        pricePerNight: Math.round(total / nights),
        amenities: ["Wi-Fi"],
        imageHue: (i * 47) % 360,
      } as AmadeusHotel;
    })
    .filter(Boolean) as AmadeusHotel[];
}
