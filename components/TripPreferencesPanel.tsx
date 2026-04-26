"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Car,
  ChevronDown,
  ChevronUp,
  Compass,
  Hotel as HotelIcon,
  MountainSnow,
  Plane,
  Plus,
  Settings2,
  StickyNote,
  Trash2,
  Utensils,
  Wallet,
} from "lucide-react";
import type {
  EmergencyContact,
  FrequentFlyerEntry,
  LoyaltyEntry,
  TripPreferences,
} from "@/lib/types";

// ============================================================================
// Option lists
// ============================================================================

const CUISINES = [
  "Mexican",
  "Italian",
  "Japanese",
  "Thai",
  "Indian",
  "Chinese",
  "Korean",
  "Mediterranean",
  "American",
  "French",
  "Spanish",
  "Vietnamese",
  "Middle Eastern",
  "Ethiopian",
  "Peruvian",
  "Greek",
  "BBQ",
  "Seafood",
  "Steakhouse",
  "Vegan",
];

const DIET_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Gluten-free",
  "Dairy-free",
  "Nut allergy",
  "Shellfish allergy",
  "Halal",
  "Kosher",
  "Low-sodium",
];

const DINING_STYLES = [
  "Street food",
  "Casual",
  "Upscale",
  "Food trucks",
  "Buffets",
  "Tasting menus",
];

const NIGHTLIFE = ["Casual bars", "Cocktail lounges", "Clubs", "Live music", "Comedy"];
const CULTURAL = ["Museums", "Historical sites", "Local events", "Festivals", "Theatre"];
const OUTDOOR = [
  "Beaches",
  "Hiking",
  "National parks",
  "Water sports",
  "Snow sports",
  "Cycling",
];
const TRANSPORT = ["Walking", "Public transit", "Rideshare", "Rental car", "Bike"];

const AIRLINES = [
  "Southwest",
  "Delta",
  "United",
  "American",
  "JetBlue",
  "Alaska",
  "Spirit",
  "Frontier",
  "Hawaiian",
  "Lufthansa",
  "British Airways",
  "Air France",
  "KLM",
  "Emirates",
  "Qatar Airways",
  "Singapore Airlines",
  "ANA",
  "Japan Airlines",
  "Cathay Pacific",
];

const HOTEL_BRANDS = [
  "Marriott",
  "Hilton",
  "Hyatt",
  "IHG",
  "Best Western",
  "Wyndham",
  "Four Seasons",
  "Ritz-Carlton",
  "Airbnb",
  "Vrbo",
  "Boutique / independent",
];

const HOTEL_AMENITIES = [
  "Pool",
  "Gym",
  "Spa",
  "Free breakfast",
  "Parking",
  "Pet-friendly",
  "EV charging",
  "Laundry",
  "Kitchen / kitchenette",
  "Balcony",
  "Bathtub",
];

const CAR_COMPANIES = [
  "Hertz",
  "Enterprise",
  "Avis",
  "Budget",
  "National",
  "Turo",
  "Sixt",
  "Alamo",
];

const CAR_FEATURES = [
  "GPS / nav",
  "Bluetooth",
  "Backup camera",
  "Roof rack",
  "Car seat",
  "Heated seats",
  "All-wheel drive",
];

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "MXN",
  "CNY",
  "INR",
  "KRW",
  "THB",
];

// ============================================================================
// Top-level panel
// ============================================================================

export function TripPreferencesPanel({
  value,
  onChange,
  defaultOpen = false,
  storageKey,
}: {
  value: TripPreferences | undefined;
  onChange: (next: TripPreferences) => void;
  defaultOpen?: boolean;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "1") setOpen(true);
    else if (saved === "0") setOpen(false);
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  const prefs: TripPreferences = value ?? {};

  function patch(p: Partial<TripPreferences>) {
    onChange({ ...prefs, ...p, updatedAt: new Date().toISOString() });
  }

  function summary(): string {
    const bits: string[] = [];
    if (prefs.travelStyle) bits.push(cap(prefs.travelStyle));
    if (prefs.activityLevel) bits.push(`${cap(prefs.activityLevel)} pace`);
    if (prefs.preferredAirlines?.length) {
      bits.push(`${prefs.preferredAirlines.length} airlines`);
    }
    if (prefs.cuisinesLiked?.length) bits.push(`${prefs.cuisinesLiked.length} cuisines`);
    if (prefs.dailyBudgetUsd) bits.push(`$${prefs.dailyBudgetUsd}/day`);
    if (prefs.dietaryRestrictions?.length) {
      bits.push(`${prefs.dietaryRestrictions.length} dietary`);
    }
    return bits.slice(0, 4).join(" · ");
  }

  return (
    <div className="steel mt-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Settings2
            size={18}
            strokeWidth={1.75}
            className="text-[var(--accent)] flex-none"
            aria-hidden
          />
          <div className="text-left min-w-0">
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
              TRIP PREFERENCES
            </div>
            <div className="text-sm mt-0.5 truncate">
              {summary() || "Set preferences for flights, hotels, dining, and more"}
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} strokeWidth={1.75} className="flex-none" aria-hidden />
        ) : (
          <ChevronDown size={18} strokeWidth={1.75} className="flex-none" aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--edge)] divide-y divide-[var(--edge)]">
          <CollapsibleSection
            icon={Compass}
            title="Travel style"
            storageKey={storageKey ? `${storageKey}:style` : undefined}
            defaultOpen
          >
            <Field label="Travel style">
              <ChipGroup
                options={["luxury", "budget", "adventure", "relaxation", "business"]}
                value={prefs.travelStyle ? [prefs.travelStyle] : []}
                onChange={(v) =>
                  patch({
                    travelStyle:
                      (v[0] as TripPreferences["travelStyle"]) ?? undefined,
                  })
                }
                single
                renderLabel={cap}
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <Field label="Activity level">
                <select
                  className="input"
                  value={prefs.activityLevel ?? ""}
                  onChange={(e) =>
                    patch({
                      activityLevel:
                        (e.target.value as TripPreferences["activityLevel"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="relaxed">Relaxed</option>
                  <option value="moderate">Moderate</option>
                  <option value="active">Active</option>
                  <option value="extreme">Extreme</option>
                </select>
              </Field>
              <Field label="Wake-up time">
                <select
                  className="input"
                  value={prefs.wakeTime ?? ""}
                  onChange={(e) =>
                    patch({
                      wakeTime:
                        (e.target.value as TripPreferences["wakeTime"]) || undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="early-bird">Early bird (before 7am)</option>
                  <option value="normal">Normal (7–9am)</option>
                  <option value="late-riser">Late riser (after 9am)</option>
                </select>
              </Field>
            </div>
            <Field label="Transportation preference" className="mt-3">
              <ChipGroup
                options={TRANSPORT}
                value={prefs.transportationPreferences ?? []}
                onChange={(v) =>
                  patch({ transportationPreferences: v.length > 0 ? v : undefined })
                }
              />
            </Field>
          </CollapsibleSection>

          <CollapsibleSection
            icon={Plane}
            title="Airlines & flights"
            storageKey={storageKey ? `${storageKey}:airlines` : undefined}
          >
            <Field label="Preferred airlines">
              <ChipGroup
                options={AIRLINES}
                value={prefs.preferredAirlines ?? []}
                onChange={(v) =>
                  patch({ preferredAirlines: v.length > 0 ? v : undefined })
                }
              />
            </Field>
            <Field label="Airlines to avoid" className="mt-4">
              <ChipGroup
                options={AIRLINES}
                value={prefs.airlinesToAvoid ?? []}
                onChange={(v) => patch({ airlinesToAvoid: v.length > 0 ? v : undefined })}
                tone="danger"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <Field label="Seat preference">
                <select
                  className="input"
                  value={prefs.seatPreference ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      seatPreference: e.target
                        .value as TripPreferences["seatPreference"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="window">Window</option>
                  <option value="aisle">Aisle</option>
                  <option value="middle">Middle</option>
                </select>
              </Field>
              <Field label="Seat location">
                <select
                  className="input"
                  value={prefs.seatLocation ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      seatLocation: e.target
                        .value as TripPreferences["seatLocation"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="front">Front</option>
                  <option value="middle">Middle</option>
                  <option value="back">Back</option>
                  <option value="exit-row">Exit row</option>
                  <option value="bulkhead">Bulkhead</option>
                </select>
              </Field>
              <Field label="Class">
                <select
                  className="input"
                  value={prefs.flightClass ?? ""}
                  onChange={(e) =>
                    patch({
                      flightClass:
                        (e.target.value as TripPreferences["flightClass"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="basic-economy">Basic economy</option>
                  <option value="economy">Economy</option>
                  <option value="premium-economy">Premium economy</option>
                  <option value="business">Business</option>
                  <option value="first">First</option>
                </select>
              </Field>
              <Field label="Baggage">
                <select
                  className="input"
                  value={prefs.baggage ?? ""}
                  onChange={(e) =>
                    patch({
                      baggage:
                        (e.target.value as TripPreferences["baggage"]) || undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="carry-on">Carry-on only</option>
                  <option value="1-checked">1 checked bag</option>
                  <option value="2-plus-checked">2+ checked bags</option>
                </select>
              </Field>
              <Field label="In-flight meal">
                <select
                  className="input"
                  value={prefs.inFlightMeal ?? ""}
                  onChange={(e) =>
                    patch({
                      inFlightMeal:
                        (e.target.value as TripPreferences["inFlightMeal"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="standard">Standard</option>
                  <option value="vegetarian">Vegetarian</option>
                  <option value="vegan">Vegan</option>
                  <option value="kosher">Kosher</option>
                  <option value="halal">Halal</option>
                  <option value="gluten-free">Gluten-free</option>
                </select>
              </Field>
              <Field label="Departure time">
                <select
                  className="input"
                  value={prefs.preferredDepartureTime ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      preferredDepartureTime: e.target
                        .value as TripPreferences["preferredDepartureTime"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="red-eye">Red-eye</option>
                  <option value="early-morning">Early morning</option>
                  <option value="midday">Midday</option>
                  <option value="evening">Evening</option>
                </select>
              </Field>
              <Field label="Layover">
                <select
                  className="input"
                  value={prefs.layoverPreference ?? ""}
                  onChange={(e) =>
                    patch({
                      layoverPreference:
                        (e.target.value as TripPreferences["layoverPreference"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="direct-only">Direct only</option>
                  <option value="short-ok">Short layover OK</option>
                  <option value="any">Any</option>
                </select>
              </Field>
              <Field label="Alliance">
                <select
                  className="input"
                  value={prefs.alliance ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      alliance: e.target.value as TripPreferences["alliance"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="star">Star Alliance</option>
                  <option value="skyteam">SkyTeam</option>
                  <option value="oneworld">Oneworld</option>
                </select>
              </Field>
            </div>
            <FrequentFlyerEditor
              entries={prefs.frequentFlyer ?? []}
              onChange={(frequentFlyer) => patch({ frequentFlyer })}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <Field label="TSA PreCheck">
                <input
                  className="input"
                  value={prefs.trustedTraveler?.tsaPrecheck ?? ""}
                  onChange={(e) =>
                    patch({
                      trustedTraveler: {
                        ...prefs.trustedTraveler,
                        tsaPrecheck: e.target.value || undefined,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Global Entry">
                <input
                  className="input"
                  value={prefs.trustedTraveler?.globalEntry ?? ""}
                  onChange={(e) =>
                    patch({
                      trustedTraveler: {
                        ...prefs.trustedTraveler,
                        globalEntry: e.target.value || undefined,
                      },
                    })
                  }
                />
              </Field>
              <Field label="CLEAR">
                <input
                  className="input"
                  value={prefs.trustedTraveler?.clear ?? ""}
                  onChange={(e) =>
                    patch({
                      trustedTraveler: {
                        ...prefs.trustedTraveler,
                        clear: e.target.value || undefined,
                      },
                    })
                  }
                />
              </Field>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            icon={HotelIcon}
            title="Hotels"
            storageKey={storageKey ? `${storageKey}:hotels` : undefined}
          >
            <Field label="Preferred brands">
              <ChipGroup
                options={HOTEL_BRANDS}
                value={prefs.hotelBrands ?? []}
                onChange={(v) => patch({ hotelBrands: v.length > 0 ? v : undefined })}
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <Field label="Room type">
                <select
                  className="input"
                  value={prefs.roomType ?? ""}
                  onChange={(e) =>
                    patch({
                      roomType:
                        (e.target.value as TripPreferences["roomType"]) || undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="standard">Standard</option>
                  <option value="suite">Suite</option>
                  <option value="studio">Studio</option>
                  <option value="villa">Villa</option>
                  <option value="penthouse">Penthouse</option>
                </select>
              </Field>
              <Field label="Bed">
                <select
                  className="input"
                  value={prefs.bedSize ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      bedSize: e.target.value as TripPreferences["bedSize"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="king">King</option>
                  <option value="two-queens">Two queens</option>
                  <option value="queen">Queen</option>
                  <option value="double">Double</option>
                  <option value="twin">Twin</option>
                </select>
              </Field>
              <Field label="Floor">
                <select
                  className="input"
                  value={prefs.floorPreference ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      floorPreference: e.target
                        .value as TripPreferences["floorPreference"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="low">Low floor</option>
                  <option value="mid">Mid floor</option>
                  <option value="high">High floor</option>
                </select>
              </Field>
              <Field label="View">
                <select
                  className="input"
                  value={prefs.viewPreference ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      viewPreference: e.target
                        .value as TripPreferences["viewPreference"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="ocean">Ocean</option>
                  <option value="city">City</option>
                  <option value="pool">Pool</option>
                  <option value="garden">Garden</option>
                </select>
              </Field>
              <Field label="Smoking">
                <select
                  className="input"
                  value={prefs.smokingPreference ?? "non-smoking"}
                  onChange={(e) =>
                    patch({
                      smokingPreference: e.target
                        .value as TripPreferences["smokingPreference"],
                    })
                  }
                >
                  <option value="non-smoking">Non-smoking</option>
                  <option value="smoking">Smoking</option>
                </select>
              </Field>
              <Field label="Pillow">
                <select
                  className="input"
                  value={prefs.pillowPreference ?? ""}
                  onChange={(e) =>
                    patch({
                      pillowPreference:
                        (e.target.value as TripPreferences["pillowPreference"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="firm">Firm</option>
                  <option value="soft">Soft</option>
                  <option value="hypoallergenic">Hypoallergenic</option>
                </select>
              </Field>
              <Field label="Check-in">
                <select
                  className="input"
                  value={prefs.checkInPreference ?? "standard"}
                  onChange={(e) =>
                    patch({
                      checkInPreference: e.target
                        .value as TripPreferences["checkInPreference"],
                    })
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="early">Early check-in</option>
                  <option value="late">Late check-in</option>
                </select>
              </Field>
              <Field label="Check-out">
                <select
                  className="input"
                  value={prefs.checkOutPreference ?? "standard"}
                  onChange={(e) =>
                    patch({
                      checkOutPreference: e.target
                        .value as TripPreferences["checkOutPreference"],
                    })
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="early">Early check-out</option>
                  <option value="late">Late check-out</option>
                </select>
              </Field>
            </div>
            <Field label="Must-have amenities" className="mt-4">
              <ChipGroup
                options={HOTEL_AMENITIES}
                value={prefs.hotelAmenities ?? []}
                onChange={(v) =>
                  patch({ hotelAmenities: v.length > 0 ? v : undefined })
                }
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <Field label="Min budget per night (USD)">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="e.g. 100"
                  value={prefs.hotelBudgetMin ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    patch({ hotelBudgetMin: isNaN(n) ? undefined : n });
                  }}
                />
              </Field>
              <Field label="Max budget per night (USD)">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="e.g. 350"
                  value={prefs.hotelBudgetMax ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    patch({ hotelBudgetMax: isNaN(n) ? undefined : n });
                  }}
                />
              </Field>
            </div>
            <LoyaltyEditor
              label="Hotel loyalty programs"
              programs={["Marriott Bonvoy", "Hilton Honors", "World of Hyatt", "IHG Rewards", "Wyndham Rewards"]}
              entries={prefs.hotelLoyalty ?? []}
              onChange={(hotelLoyalty) => patch({ hotelLoyalty })}
            />
          </CollapsibleSection>

          <CollapsibleSection
            icon={Car}
            title="Rental cars"
            storageKey={storageKey ? `${storageKey}:cars` : undefined}
          >
            <Field label="Preferred companies">
              <ChipGroup
                options={CAR_COMPANIES}
                value={prefs.carRentalCompanies ?? []}
                onChange={(v) =>
                  patch({ carRentalCompanies: v.length > 0 ? v : undefined })
                }
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <Field label="Class">
                <select
                  className="input"
                  value={prefs.carClass ?? ""}
                  onChange={(e) =>
                    patch({
                      carClass:
                        (e.target.value as TripPreferences["carClass"]) || undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="economy">Economy</option>
                  <option value="compact">Compact</option>
                  <option value="midsize">Midsize</option>
                  <option value="full-size">Full-size</option>
                  <option value="suv">SUV</option>
                  <option value="minivan">Minivan</option>
                  <option value="luxury">Luxury</option>
                  <option value="convertible">Convertible</option>
                  <option value="truck">Truck</option>
                </select>
              </Field>
              <Field label="Transmission">
                <select
                  className="input"
                  value={prefs.carTransmission ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      carTransmission: e.target
                        .value as TripPreferences["carTransmission"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                </select>
              </Field>
              <Field label="Fuel type">
                <select
                  className="input"
                  value={prefs.carFuelType ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      carFuelType: e.target.value as TripPreferences["carFuelType"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="gas">Gas</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="electric">Electric</option>
                </select>
              </Field>
              <Field label="Insurance">
                <select
                  className="input"
                  value={prefs.carInsurance ?? ""}
                  onChange={(e) =>
                    patch({
                      carInsurance:
                        (e.target.value as TripPreferences["carInsurance"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="own">Use own coverage</option>
                  <option value="full">Buy full coverage</option>
                  <option value="liability">Buy liability only</option>
                </select>
              </Field>
              <Field label="Pickup">
                <select
                  className="input"
                  value={prefs.carPickup ?? ""}
                  onChange={(e) =>
                    patch({
                      carPickup:
                        (e.target.value as TripPreferences["carPickup"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="airport">Airport counter</option>
                  <option value="off-site">Off-site</option>
                  <option value="delivered">Delivered</option>
                </select>
              </Field>
            </div>
            <Field label="Must-have features" className="mt-4">
              <ChipGroup
                options={CAR_FEATURES}
                value={prefs.carFeatures ?? []}
                onChange={(v) => patch({ carFeatures: v.length > 0 ? v : undefined })}
              />
            </Field>
            <LoyaltyEditor
              label="Car rental loyalty programs"
              programs={["Hertz Gold", "Enterprise Plus", "National Emerald", "Avis Preferred", "Sixt", "Budget Fastbreak"]}
              entries={prefs.carLoyalty ?? []}
              onChange={(carLoyalty) => patch({ carLoyalty })}
            />
          </CollapsibleSection>

          <CollapsibleSection
            icon={Utensils}
            title="Food & dining"
            storageKey={storageKey ? `${storageKey}:food` : undefined}
          >
            <Field label="Cuisines you love">
              <ChipGroup
                options={CUISINES}
                value={prefs.cuisinesLiked ?? []}
                onChange={(v) =>
                  patch({ cuisinesLiked: v.length > 0 ? v : undefined })
                }
              />
            </Field>
            <Field label="Cuisines to avoid" className="mt-4">
              <ChipGroup
                options={CUISINES}
                value={prefs.cuisinesDisliked ?? []}
                onChange={(v) =>
                  patch({ cuisinesDisliked: v.length > 0 ? v : undefined })
                }
                tone="danger"
              />
            </Field>
            <Field label="Dietary restrictions" className="mt-4">
              <ChipGroup
                options={DIET_OPTIONS}
                value={prefs.dietaryRestrictions ?? []}
                onChange={(v) =>
                  patch({ dietaryRestrictions: v.length > 0 ? v : undefined })
                }
              />
            </Field>
            <Field label="Dining style" className="mt-4">
              <ChipGroup
                options={DINING_STYLES}
                value={prefs.diningStyles ?? []}
                onChange={(v) => patch({ diningStyles: v.length > 0 ? v : undefined })}
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <Field label="Spice tolerance">
                <select
                  className="input"
                  value={prefs.spiceTolerance ?? ""}
                  onChange={(e) =>
                    patch({
                      spiceTolerance:
                        (e.target.value as TripPreferences["spiceTolerance"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="mild">Mild</option>
                  <option value="medium">Medium</option>
                  <option value="hot">Hot</option>
                  <option value="extra-hot">Extra hot</option>
                </select>
              </Field>
              <Field label="Meal budget">
                <select
                  className="input"
                  value={prefs.mealBudget ?? ""}
                  onChange={(e) =>
                    patch({
                      mealBudget:
                        (e.target.value as TripPreferences["mealBudget"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="cheap-eats">Cheap eats</option>
                  <option value="moderate">Moderate</option>
                  <option value="fine-dining">Fine dining</option>
                </select>
              </Field>
              <Field label="Alcohol">
                <select
                  className="input"
                  value={prefs.alcohol ?? ""}
                  onChange={(e) =>
                    patch({
                      alcohol:
                        (e.target.value as TripPreferences["alcohol"]) || undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="none">None</option>
                  <option value="beer-wine">Beer / wine only</option>
                  <option value="cocktails">Cocktails</option>
                  <option value="local-specialties">Local specialties</option>
                </select>
              </Field>
              <Field label="Coffee">
                <select
                  className="input"
                  value={prefs.coffee ?? ""}
                  onChange={(e) =>
                    patch({
                      coffee:
                        (e.target.value as TripPreferences["coffee"]) || undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="black">Black</option>
                  <option value="latte">Latte</option>
                  <option value="espresso">Espresso</option>
                  <option value="no-coffee">No coffee</option>
                  <option value="tea-only">Tea only</option>
                </select>
              </Field>
              <Field label="Breakfast">
                <select
                  className="input"
                  value={prefs.breakfast ?? ""}
                  onChange={(e) =>
                    patch({
                      breakfast:
                        (e.target.value as TripPreferences["breakfast"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="hotel">Hotel breakfast</option>
                  <option value="local-cafe">Local cafe</option>
                  <option value="skip">Skip breakfast</option>
                </select>
              </Field>
            </div>
            <Field label="Specific allergies / intolerances" className="mt-4">
              <textarea
                className="input"
                rows={2}
                placeholder="Anaphylactic to peanuts, mild lactose intolerance…"
                value={prefs.foodAllergies ?? ""}
                onChange={(e) => patch({ foodAllergies: e.target.value || undefined })}
                style={{ height: "auto", padding: "12px 14px", fontSize: 13 }}
              />
            </Field>
          </CollapsibleSection>

          <CollapsibleSection
            icon={MountainSnow}
            title="Activities & interests"
            storageKey={storageKey ? `${storageKey}:activities` : undefined}
          >
            <Field label="Cultural">
              <ChipGroup
                options={CULTURAL}
                value={prefs.culturalInterests ?? []}
                onChange={(v) =>
                  patch({ culturalInterests: v.length > 0 ? v : undefined })
                }
              />
            </Field>
            <Field label="Nature & outdoor" className="mt-4">
              <ChipGroup
                options={OUTDOOR}
                value={prefs.outdoorInterests ?? []}
                onChange={(v) =>
                  patch({ outdoorInterests: v.length > 0 ? v : undefined })
                }
              />
            </Field>
            <Field label="Nightlife" className="mt-4">
              <ChipGroup
                options={NIGHTLIFE}
                value={prefs.nightlifeInterests ?? []}
                onChange={(v) =>
                  patch({ nightlifeInterests: v.length > 0 ? v : undefined })
                }
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <Field label="Photography spots">
                <select
                  className="input"
                  value={
                    prefs.photographyInterest === undefined
                      ? ""
                      : prefs.photographyInterest
                        ? "yes"
                        : "no"
                  }
                  onChange={(e) =>
                    patch({
                      photographyInterest:
                        e.target.value === ""
                          ? undefined
                          : e.target.value === "yes",
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="yes">Yes — seek them out</option>
                  <option value="no">Not particularly</option>
                </select>
              </Field>
              <Field label="Shopping">
                <select
                  className="input"
                  value={prefs.shoppingInterest ?? ""}
                  onChange={(e) =>
                    patch({
                      shoppingInterest:
                        (e.target.value as TripPreferences["shoppingInterest"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">No preference</option>
                  <option value="none">Not interested</option>
                  <option value="casual">Casual browsing</option>
                  <option value="serious">Serious shopping</option>
                </select>
              </Field>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            icon={Wallet}
            title="Budget & currency"
            storageKey={storageKey ? `${storageKey}:budget` : undefined}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Daily budget (USD)">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="e.g. 250"
                  value={prefs.dailyBudgetUsd ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    patch({ dailyBudgetUsd: isNaN(n) ? undefined : n });
                  }}
                />
              </Field>
              <Field label="Preferred currency">
                <select
                  className="input"
                  value={prefs.preferredCurrency ?? "USD"}
                  onChange={(e) => patch({ preferredCurrency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            icon={AlertCircle}
            title="Safety & insurance"
            storageKey={storageKey ? `${storageKey}:safety` : undefined}
          >
            <EmergencyContactsEditor
              entries={prefs.emergencyContacts ?? []}
              onChange={(emergencyContacts) => patch({ emergencyContacts })}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <Field label="Insurance provider">
                <input
                  className="input"
                  value={prefs.insurance?.provider ?? ""}
                  onChange={(e) =>
                    patch({
                      insurance: {
                        ...prefs.insurance,
                        provider: e.target.value || undefined,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Policy number">
                <input
                  className="input"
                  value={prefs.insurance?.policyNumber ?? ""}
                  onChange={(e) =>
                    patch({
                      insurance: {
                        ...prefs.insurance,
                        policyNumber: e.target.value || undefined,
                      },
                    })
                  }
                />
              </Field>
              <Field label="24h support phone">
                <input
                  className="input"
                  value={prefs.insurance?.phone ?? ""}
                  onChange={(e) =>
                    patch({
                      insurance: {
                        ...prefs.insurance,
                        phone: e.target.value || undefined,
                      },
                    })
                  }
                />
              </Field>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            icon={StickyNote}
            title="Notes"
            storageKey={storageKey ? `${storageKey}:notes` : undefined}
          >
            <textarea
              className="input"
              rows={3}
              placeholder="Special requirements, accessibility needs, must-do experiences…"
              value={prefs.notes ?? ""}
              onChange={(e) => patch({ notes: e.target.value || undefined })}
              style={{ height: "auto", padding: "12px 14px", fontSize: 13 }}
            />
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Reusable bits
// ============================================================================

function CollapsibleSection({
  icon: Icon,
  title,
  children,
  storageKey,
  defaultOpen = false,
}: {
  icon: typeof Plane;
  title: string;
  children: React.ReactNode;
  storageKey?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "1") setOpen(true);
    else if (saved === "0") setOpen(false);
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-3.5 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <Icon
            size={14}
            strokeWidth={1.75}
            className="text-[var(--muted)] flex-none"
            aria-hidden
          />
          <span className="text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase">
            {title}
          </span>
        </div>
        {open ? (
          <ChevronUp
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="text-[var(--muted)]"
          />
        ) : (
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="text-[var(--muted)]"
          />
        )}
      </button>
      {open && <div className="px-6 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <div className="text-[var(--muted)] mb-1 text-xs">{label}</div>
      {children}
    </label>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
  single = false,
  tone = "default",
  renderLabel,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  single?: boolean;
  tone?: "default" | "danger";
  renderLabel?: (s: string) => string;
}) {
  function toggle(opt: string) {
    if (single) {
      onChange(value[0] === opt ? [] : [opt]);
      return;
    }
    if (value.includes(opt)) onChange(value.filter((v) => v !== opt));
    else onChange([...value, opt]);
  }
  const activeBorder =
    tone === "danger"
      ? "border-[var(--danger)] text-[var(--danger)]"
      : "border-[var(--accent)] text-[var(--accent)]";
  const activeBg =
    tone === "danger"
      ? "bg-[rgba(251,113,133,0.12)]"
      : "bg-[var(--accent-soft)]";
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={
              "px-3 py-1.5 text-xs rounded-full border transition " +
              (active
                ? `${activeBorder} ${activeBg}`
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]")
            }
          >
            {renderLabel ? renderLabel(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}

function FrequentFlyerEditor({
  entries,
  onChange,
}: {
  entries: FrequentFlyerEntry[];
  onChange: (next: FrequentFlyerEntry[] | undefined) => void;
}) {
  function update(idx: number, p: Partial<FrequentFlyerEntry>) {
    const next = entries.map((e, i) => (i === idx ? { ...e, ...p } : e));
    onChange(next.length > 0 ? next : undefined);
  }
  function remove(idx: number) {
    const next = entries.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  }
  return (
    <div className="mt-4">
      <div className="text-xs text-[var(--muted)] mb-2">Frequent flyer numbers</div>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              className="input flex-none"
              style={{ width: 160 }}
              placeholder="Airline"
              value={e.airline}
              onChange={(ev) => update(i, { airline: ev.target.value })}
            />
            <input
              className="input flex-1"
              placeholder="Number"
              value={e.number}
              onChange={(ev) => update(i, { number: ev.target.value })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-2"
              aria-label="Remove"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...entries, { airline: "", number: "" }])}
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <Plus size={12} strokeWidth={1.75} aria-hidden />
        Add airline
      </button>
    </div>
  );
}

function LoyaltyEditor({
  label,
  programs,
  entries,
  onChange,
}: {
  label: string;
  programs: string[];
  entries: LoyaltyEntry[];
  onChange: (next: LoyaltyEntry[] | undefined) => void;
}) {
  function update(idx: number, p: Partial<LoyaltyEntry>) {
    const next = entries.map((e, i) => (i === idx ? { ...e, ...p } : e));
    onChange(next.length > 0 ? next : undefined);
  }
  function remove(idx: number) {
    const next = entries.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  }
  return (
    <div className="mt-4">
      <div className="text-xs text-[var(--muted)] mb-2">{label}</div>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              className="input flex-none"
              style={{ width: 200 }}
              list={`loyalty-options-${label}`}
              placeholder="Program"
              value={e.program}
              onChange={(ev) => update(i, { program: ev.target.value })}
            />
            <input
              className="input flex-1"
              placeholder="Number"
              value={e.number}
              onChange={(ev) => update(i, { number: ev.target.value })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-2"
              aria-label="Remove"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <datalist id={`loyalty-options-${label}`}>
        {programs.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={() => onChange([...entries, { program: "", number: "" }])}
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <Plus size={12} strokeWidth={1.75} aria-hidden />
        Add program
      </button>
    </div>
  );
}

function EmergencyContactsEditor({
  entries,
  onChange,
}: {
  entries: EmergencyContact[];
  onChange: (next: EmergencyContact[] | undefined) => void;
}) {
  function update(idx: number, p: Partial<EmergencyContact>) {
    const next = entries.map((e, i) => (i === idx ? { ...e, ...p } : e));
    onChange(next.length > 0 ? next : undefined);
  }
  function remove(idx: number) {
    const next = entries.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  }
  return (
    <div>
      <div className="text-xs text-[var(--muted)] mb-2">Emergency contacts</div>
      <div className="space-y-2">
        {entries.map((c, i) => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_auto] gap-2 items-center"
          >
            <input
              className="input"
              placeholder="Name"
              value={c.name}
              onChange={(ev) => update(i, { name: ev.target.value })}
            />
            <input
              className="input"
              placeholder="Relation"
              value={c.relation}
              onChange={(ev) => update(i, { relation: ev.target.value })}
            />
            <input
              className="input"
              placeholder="Phone"
              value={c.phone}
              onChange={(ev) => update(i, { phone: ev.target.value })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-2 justify-self-end"
              aria-label="Remove"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange([...entries, { name: "", relation: "", phone: "" }])
        }
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <Plus size={12} strokeWidth={1.75} aria-hidden />
        Add contact
      </button>
    </div>
  );
}

function cap(s: string): string {
  if (!s) return s;
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
