import { generateFlights } from "./mock-data";

const GAS_PRICE_PER_GAL = 3.5;
const MPG = 28;
const AVG_DRIVE_MPH = 58;
const MAX_DRIVE_HOURS_PER_DAY = 8;
const HOTEL_NIGHT_USD = 130;
const AIRPORT_TRANSFERS_PER_PAX = 80;
const TOLLS_PER_100MI = 4.5;
const PARKING_PER_DAY = 18;
const BAGGAGE_PER_PAX = 35;
const RESORT_FEE_NIGHTLY = 28;
const FX_FEE_PCT = 0.025;
// Driving emissions ~0.404 kg CO2/mi (EPA avg car). Flying ~0.255 kg/mi/pax (short-haul).
const CO2_PER_MILE_DRIVE_KG = 0.404;
const CO2_PER_MILE_FLY_PER_PAX_KG = 0.255;
const CARBON_OFFSET_PER_TON_USD = 18;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export type Compare = {
  drive: {
    miles: number;
    hours: number;
    overnightStops: number;
    gasUsd: number;
    tollsUsd: number;
    lodgingUsd: number;
    parkingUsd: number;
    totalUsd: number;
    co2Kg: number;
  };
  fly: {
    minutes: number;
    cheapestFareUsd: number;
    transfersUsd: number;
    baggageUsd: number;
    resortFeesUsd: number;
    fxUsd: number;
    totalUsd: number;
    co2Kg: number;
  };
  cheaperBy: "drive" | "fly" | "tie";
  fasterBy: "drive" | "fly" | "tie";
  greenerBy: "drive" | "fly";
  savingsUsd: number;
  carbonOffsetUsd: number;
};

export function comparePlan({
  origin,
  destination,
  date,
  travelers,
  nights = 4,
  international = false,
}: {
  origin: string;
  destination: string;
  date: string;
  travelers: number;
  nights?: number;
  international?: boolean;
}): Compare {
  const seed = hashString(`${origin.toLowerCase()}|${destination.toLowerCase()}`);
  const miles = 80 + (seed % 2720);
  const hours = miles / AVG_DRIVE_MPH;
  const overnightStops = Math.max(0, Math.ceil(hours / MAX_DRIVE_HOURS_PER_DAY) - 1);
  const gasUsd = (miles / MPG) * GAS_PRICE_PER_GAL;
  const tollsUsd = (miles / 100) * TOLLS_PER_100MI;
  const lodgingUsd = overnightStops * HOTEL_NIGHT_USD;
  const parkingUsd = PARKING_PER_DAY * Math.max(1, nights);
  const driveTotal = gasUsd + tollsUsd + lodgingUsd + parkingUsd;
  const driveCo2 = miles * CO2_PER_MILE_DRIVE_KG;

  const flights = generateFlights(origin, destination, date);
  const cheapest = flights[0];
  const flyMinutes = cheapest?.durationMinutes ?? 240;
  const cheapestFare = cheapest?.price ?? 350;
  const transfers = AIRPORT_TRANSFERS_PER_PAX * travelers;
  const baggage = BAGGAGE_PER_PAX * travelers;
  const resortFees = RESORT_FEE_NIGHTLY * Math.max(1, nights);
  const baseFlySpend = cheapestFare * travelers + transfers + baggage + resortFees;
  const fxUsd = international ? Math.round(baseFlySpend * FX_FEE_PCT) : 0;
  const flyTotal = baseFlySpend + fxUsd;
  const flyCo2 = miles * CO2_PER_MILE_FLY_PER_PAX_KG * travelers;

  const savingsUsd = Math.round(Math.abs(driveTotal - flyTotal));
  const cheaperBy: Compare["cheaperBy"] =
    Math.abs(driveTotal - flyTotal) < 5
      ? "tie"
      : driveTotal < flyTotal
      ? "drive"
      : "fly";
  const fasterBy: Compare["fasterBy"] =
    hours * 60 < flyMinutes + 180 ? "drive" : "fly";
  const greenerBy = driveCo2 < flyCo2 ? "drive" : "fly";
  const carbonOffsetUsd =
    Math.max(driveCo2, flyCo2) / 1000 * CARBON_OFFSET_PER_TON_USD;

  return {
    drive: {
      miles: Math.round(miles),
      hours: Math.round(hours * 10) / 10,
      overnightStops,
      gasUsd: Math.round(gasUsd),
      tollsUsd: Math.round(tollsUsd),
      lodgingUsd: Math.round(lodgingUsd),
      parkingUsd: Math.round(parkingUsd),
      totalUsd: Math.round(driveTotal),
      co2Kg: Math.round(driveCo2),
    },
    fly: {
      minutes: flyMinutes,
      cheapestFareUsd: cheapestFare,
      transfersUsd: transfers,
      baggageUsd: baggage,
      resortFeesUsd: resortFees,
      fxUsd,
      totalUsd: Math.round(flyTotal),
      co2Kg: Math.round(flyCo2),
    },
    cheaperBy,
    fasterBy,
    greenerBy,
    savingsUsd,
    carbonOffsetUsd: Math.round(carbonOffsetUsd),
  };
}
