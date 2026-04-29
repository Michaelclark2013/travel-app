// lib/admin/tax.ts — Track 5 tax-rate lookup.
//
// WHAT
//   taxFor(country) -> { vatRate, gstRate, label } for ~30 of the largest
//   markets. Hardcoded — Stripe Tax will override this when the customer
//   actually checks out, but the admin UI uses these to estimate tax-included
//   refund totals and to label invoices when Stripe Tax isn't enabled yet.
//
// WHY a hardcoded table
//   Querying Stripe Tax just to render a "Refund — incl. ~12% MwSt" hint in
//   the dashboard is wasteful. These rates are stable for years (~1-2% drift)
//   and the admin UI clearly labels them as estimates. Real source-of-truth
//   for what the customer actually paid is the Stripe invoice's `tax`
//   amount; this helper is only for forecasting / display.
//
// SHAPE
//   country code: ISO-3166-1 alpha-2, uppercase. Lookup is case-insensitive.
//   vatRate / gstRate: standard rate as a number 0..1 (e.g. 0.20 for 20%).
//                      One of the two will be 0 depending on the regime.
//   label: human-readable tag for the rate ("VAT", "GST", "HST", "Sales tax").

export type TaxInfo = {
  country: string;        // uppercase 2-letter
  vatRate: number;        // 0..1 (0 if non-VAT)
  gstRate: number;        // 0..1 (0 if non-GST)
  label: string;          // "VAT" | "GST" | "HST" | "Sales tax" | "—"
};

// Top ~30 markets by Voyage GTM target. Standard rate only (reduced rates
// for groceries/books are out of scope). Last reviewed 2026-04-29.
const TABLE: Record<string, Omit<TaxInfo, "country">> = {
  // Eurozone — VAT
  AT: { vatRate: 0.20, gstRate: 0, label: "VAT" }, // Austria
  BE: { vatRate: 0.21, gstRate: 0, label: "VAT" }, // Belgium
  DE: { vatRate: 0.19, gstRate: 0, label: "VAT" }, // Germany
  ES: { vatRate: 0.21, gstRate: 0, label: "VAT" }, // Spain
  FI: { vatRate: 0.255, gstRate: 0, label: "VAT" }, // Finland
  FR: { vatRate: 0.20, gstRate: 0, label: "VAT" }, // France
  GR: { vatRate: 0.24, gstRate: 0, label: "VAT" }, // Greece
  IE: { vatRate: 0.23, gstRate: 0, label: "VAT" }, // Ireland
  IT: { vatRate: 0.22, gstRate: 0, label: "VAT" }, // Italy
  NL: { vatRate: 0.21, gstRate: 0, label: "VAT" }, // Netherlands
  PT: { vatRate: 0.23, gstRate: 0, label: "VAT" }, // Portugal

  // Other Europe — VAT
  CH: { vatRate: 0.081, gstRate: 0, label: "VAT" }, // Switzerland
  GB: { vatRate: 0.20, gstRate: 0, label: "VAT" }, // United Kingdom
  NO: { vatRate: 0.25, gstRate: 0, label: "VAT" }, // Norway
  PL: { vatRate: 0.23, gstRate: 0, label: "VAT" }, // Poland
  SE: { vatRate: 0.25, gstRate: 0, label: "VAT" }, // Sweden

  // North America
  CA: { vatRate: 0, gstRate: 0.05, label: "GST" }, // Canada (federal GST; HST varies by province)
  MX: { vatRate: 0.16, gstRate: 0, label: "VAT" }, // Mexico (IVA)
  US: { vatRate: 0, gstRate: 0, label: "Sales tax" }, // U.S. — no federal rate; state-level

  // APAC
  AU: { vatRate: 0, gstRate: 0.10, label: "GST" }, // Australia
  CN: { vatRate: 0.13, gstRate: 0, label: "VAT" }, // China
  HK: { vatRate: 0, gstRate: 0, label: "—" },     // Hong Kong — no VAT/GST
  ID: { vatRate: 0.11, gstRate: 0, label: "VAT" }, // Indonesia
  IN: { vatRate: 0, gstRate: 0.18, label: "GST" }, // India
  JP: { vatRate: 0.10, gstRate: 0, label: "VAT" }, // Japan (Consumption Tax)
  KR: { vatRate: 0.10, gstRate: 0, label: "VAT" }, // South Korea
  NZ: { vatRate: 0, gstRate: 0.15, label: "GST" }, // New Zealand
  SG: { vatRate: 0, gstRate: 0.09, label: "GST" }, // Singapore
  TH: { vatRate: 0.07, gstRate: 0, label: "VAT" }, // Thailand

  // Misc
  AE: { vatRate: 0.05, gstRate: 0, label: "VAT" }, // UAE
  BR: { vatRate: 0.17, gstRate: 0, label: "VAT" }, // Brazil (ICMS — varies by state)
};

/**
 * Returns the standard tax info for a country code, or a zero-rate fallback
 * if unknown. Never throws.
 */
export function taxFor(countryCode: string | null | undefined): TaxInfo {
  const cc = (countryCode ?? "").trim().toUpperCase();
  const hit = cc ? TABLE[cc] : undefined;
  if (!hit) {
    return { country: cc || "??", vatRate: 0, gstRate: 0, label: "—" };
  }
  return { country: cc, ...hit };
}

/** All known country codes (uppercase). Useful for admin UI dropdowns. */
export function knownTaxCountries(): string[] {
  return Object.keys(TABLE).sort();
}
