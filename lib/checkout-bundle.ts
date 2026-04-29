// Insurance + carbon offset bundling. Pricing engine returns demo quotes; real
// integrations hook in via env vars later (Allianz Partners, HeyMondo, Cloverly,
// Wren). All commission rates are configurable per partner.

export type InsuranceTier = "basic" | "standard" | "premium";

const INSURANCE_TIER_RATE: Record<InsuranceTier, number> = {
  basic: 0.04, // 4% of trip cost
  standard: 0.07,
  premium: 0.11,
};

const INSURANCE_TIER_FEATURES: Record<InsuranceTier, string[]> = {
  basic: [
    "Trip cancellation up to 100%",
    "Emergency medical $50K",
    "24/7 assistance",
  ],
  standard: [
    "Cancel for any reason 50%",
    "Emergency medical $250K",
    "Lost baggage $1,500",
    "Travel delay $200/day",
  ],
  premium: [
    "Cancel for any reason 75%",
    "Emergency medical $500K + evac",
    "Lost baggage $3,000",
    "Adventure sports covered",
    "Concierge replacement",
  ],
};

// EPA: ~0.255 kg CO2 / mile / passenger for short-haul flight.
// Long-haul (>3000mi) is closer to 0.18, but we use 0.22 as a blend for demo simplicity.
const KG_CO2_PER_MILE_PER_PAX = 0.22;
const OFFSET_USD_PER_TON = 18; // typical Cloverly/Wren rate

export type CheckoutBundleQuote = {
  trip: {
    destination: string;
    startDate: string;
    endDate: string;
    travelers: number;
    distanceMiles: number;
    estimatedSpendUsd: number;
  };
  insurance: {
    tier: InsuranceTier;
    priceUsd: number;
    voyageCommissionUsd: number;
    features: string[];
  }[];
  carbonOffset: {
    flightCo2Kg: number;
    offsetUsd: number;
    voyageCommissionUsd: number;
    provider: string;
  };
  recommendation: InsuranceTier;
};

const VOYAGE_INSURANCE_COMMISSION = 0.35; // 35% partner share
const VOYAGE_OFFSET_COMMISSION = 0.15;

export function quoteBundle(args: {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  distanceMiles: number;
  estimatedSpendUsd: number;
}): CheckoutBundleQuote {
  const { distanceMiles, travelers, estimatedSpendUsd } = args;

  const insurance = (Object.keys(INSURANCE_TIER_RATE) as InsuranceTier[]).map(
    (tier) => {
      const priceUsd = Math.round(estimatedSpendUsd * INSURANCE_TIER_RATE[tier]);
      return {
        tier,
        priceUsd,
        voyageCommissionUsd: Math.round(priceUsd * VOYAGE_INSURANCE_COMMISSION),
        features: INSURANCE_TIER_FEATURES[tier],
      };
    }
  );

  const flightCo2Kg = Math.round(
    distanceMiles * KG_CO2_PER_MILE_PER_PAX * travelers
  );
  const offsetUsd = Math.max(
    1,
    Math.round((flightCo2Kg / 1000) * OFFSET_USD_PER_TON)
  );

  const recommendation: InsuranceTier =
    estimatedSpendUsd > 5000
      ? "premium"
      : estimatedSpendUsd > 1500
      ? "standard"
      : "basic";

  return {
    trip: { ...args },
    insurance,
    carbonOffset: {
      flightCo2Kg,
      offsetUsd,
      voyageCommissionUsd: Math.round(offsetUsd * VOYAGE_OFFSET_COMMISSION),
      provider: "Cloverly",
    },
    recommendation,
  };
}
