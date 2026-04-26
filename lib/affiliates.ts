// Affiliate link helpers. We default to Travelpayouts because a single signup
// gives us Skyscanner + Booking.com + 80 other partners. Set the marker on
// Vercel as NEXT_PUBLIC_TRAVELPAYOUTS_MARKER. Without it we still produce a
// search URL — just without the referral attribution.

const MARKER = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER;

export const affiliatesEnabled = !!MARKER;

function withMarker(url: string): string {
  if (!MARKER) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}marker=${MARKER}`;
}

/** Build a flight-search URL via Skyscanner Travelpayouts widget. */
export function flightAffiliateUrl({
  from,
  to,
  date,
  travelers = 1,
}: {
  from: string;
  to: string;
  date: string; // YYYY-MM-DD
  travelers?: number;
}): string {
  // Travelpayouts redirect format converts to Skyscanner deep links.
  // Format: https://tp.media/r?marker=...&p=4114&u=https://www.skyscanner.com/transport/flights/{from}/{to}/{yymmdd}/?adults={n}
  const yymmdd = date.replaceAll("-", "").slice(2);
  const target = `https://www.skyscanner.com/transport/flights/${encodeURIComponent(
    from.toLowerCase()
  )}/${encodeURIComponent(to.toLowerCase())}/${yymmdd}/?adults=${travelers}`;
  if (!MARKER) return target;
  return `https://tp.media/r?marker=${MARKER}&p=4114&u=${encodeURIComponent(target)}`;
}

/** Build a hotel-search URL — Travelpayouts → Hotellook (meta-search across providers). */
export function hotelAffiliateUrl({
  city,
  checkIn,
  checkOut,
  travelers = 2,
}: {
  city: string;
  checkIn: string;
  checkOut: string;
  travelers?: number;
}): string {
  const params = new URLSearchParams({
    destination: city,
    checkIn,
    checkOut,
    adults: String(travelers),
  });
  const target = `https://search.hotellook.com/?${params}`;
  if (!MARKER) return target;
  return `https://tp.media/r?marker=${MARKER}&p=4115&u=${encodeURIComponent(target)}`;
}

/** Direct deep-link to a specific hotel by name (used on hotel cards). */
export function hotelDeepLink({
  city,
  hotelName,
  checkIn,
  checkOut,
}: {
  city: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
}): string {
  // Booking.com search with hotel name preselected.
  const ss = encodeURIComponent(`${hotelName}, ${city}`);
  const target = `https://www.booking.com/searchresults.html?ss=${ss}&checkin=${checkIn}&checkout=${checkOut}`;
  return withMarker(target);
}

/** Rental-car redirect — Travelpayouts → DiscoverCars / RentalCars affiliate. */
export function carAffiliateUrl({
  city,
  pickup,
  dropoff,
}: {
  city: string;
  pickup: string;
  dropoff: string;
}): string {
  const target = `https://www.rentalcars.com/SearchResults.do?location=${encodeURIComponent(city)}&puDay=${pickup}&doDay=${dropoff}`;
  return withMarker(target);
}

/** eSIM via Airalo affiliate. */
export function esimAffiliateUrl(country?: string): string {
  const target = country
    ? `https://www.airalo.com/${encodeURIComponent(country.toLowerCase())}-esim`
    : "https://www.airalo.com/";
  return withMarker(target);
}

/** Activities / experiences via GetYourGuide. */
export function activityAffiliateUrl(query: string): string {
  const target = `https://www.getyourguide.com/s/?q=${encodeURIComponent(query)}`;
  return withMarker(target);
}
