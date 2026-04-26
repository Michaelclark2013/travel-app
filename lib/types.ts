export type Flight = {
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

export type Hotel = {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviews: number;
  pricePerNight: number;
  amenities: string[];
  imageHue: number;
};

export type TransportMode = "walk" | "transit" | "drive";

export type Leg = {
  mode: TransportMode;
  minutes: number;
  meters: number;
};

export type ItineraryItem = {
  id: string;
  time: string;
  title: string;
  description: string;
  category: "flight" | "hotel" | "food" | "activity" | "transit";
  location?: { name: string; lat: number; lng: number };
  legBefore?: Leg;
};

export type ItineraryDay = {
  date: string;
  label: string;
  items: ItineraryItem[];
};

export type TripIntent =
  | "vacation"
  | "work"
  | "family"
  | "honeymoon"
  | "adventure"
  | "wellness"
  | "foodie"
  | "weekend";

export type SeatPreference = "window" | "aisle" | "middle" | "no-preference";
export type SeatLocation =
  | "front"
  | "middle"
  | "back"
  | "exit-row"
  | "bulkhead"
  | "no-preference";
export type FlightClass =
  | "basic-economy"
  | "economy"
  | "premium-economy"
  | "business"
  | "first";
export type BaggageNeeds = "carry-on" | "1-checked" | "2-plus-checked";
export type InFlightMeal =
  | "standard"
  | "vegetarian"
  | "vegan"
  | "kosher"
  | "halal"
  | "gluten-free";
export type DepartureTime =
  | "red-eye"
  | "early-morning"
  | "midday"
  | "evening"
  | "no-preference";
export type LayoverPreference = "direct-only" | "short-ok" | "any";
export type Alliance = "star" | "skyteam" | "oneworld" | "no-preference";

export type FloorPreference = "low" | "mid" | "high" | "no-preference";
export type ViewPreference =
  | "ocean"
  | "city"
  | "pool"
  | "garden"
  | "no-preference";
export type BedSize =
  | "twin"
  | "double"
  | "queen"
  | "king"
  | "two-queens"
  | "no-preference";
export type RoomType = "standard" | "suite" | "studio" | "villa" | "penthouse";
export type SmokingPreference = "smoking" | "non-smoking";
export type PillowPreference = "firm" | "soft" | "hypoallergenic";
export type CheckTimePreference = "early" | "late" | "standard";

export type CarClass =
  | "economy"
  | "compact"
  | "midsize"
  | "full-size"
  | "suv"
  | "minivan"
  | "luxury"
  | "convertible"
  | "truck";
export type CarTransmission = "automatic" | "manual" | "no-preference";
export type CarFuelType = "gas" | "hybrid" | "electric" | "no-preference";
export type CarInsurance = "own" | "full" | "liability";
export type CarPickup = "airport" | "off-site" | "delivered";

export type TravelStyle =
  | "luxury"
  | "budget"
  | "adventure"
  | "relaxation"
  | "business";

export type FrequentFlyerEntry = { airline: string; number: string };
export type LoyaltyEntry = { program: string; number: string };
export type EmergencyContact = { name: string; relation: string; phone: string };
export type InsuranceInfo = {
  provider?: string;
  policyNumber?: string;
  phone?: string;
};
export type TrustedTravelerInfo = {
  tsaPrecheck?: string;
  globalEntry?: string;
  clear?: string;
};

export type SpiceTolerance = "mild" | "medium" | "hot" | "extra-hot";
export type MealBudget = "cheap-eats" | "moderate" | "fine-dining" | "no-preference";
export type AlcoholPreference =
  | "none"
  | "beer-wine"
  | "cocktails"
  | "local-specialties";
export type CoffeePreference =
  | "black"
  | "latte"
  | "espresso"
  | "no-coffee"
  | "tea-only";
export type BreakfastPreference = "hotel" | "local-cafe" | "skip";

export type ActivityLevel = "relaxed" | "moderate" | "active" | "extreme";
export type WakeTime = "early-bird" | "normal" | "late-riser";
export type ShoppingInterest = "none" | "casual" | "serious";

export type TripPreferences = {
  // ===== Travel style =====
  travelStyle?: TravelStyle;
  activityLevel?: ActivityLevel;
  wakeTime?: WakeTime;
  transportationPreferences?: string[];

  // ===== Airlines =====
  preferredAirlines?: string[];
  airlinesToAvoid?: string[];
  seatPreference?: SeatPreference;
  seatLocation?: SeatLocation;
  flightClass?: FlightClass;
  baggage?: BaggageNeeds;
  inFlightMeal?: InFlightMeal;
  frequentFlyer?: FrequentFlyerEntry[];
  trustedTraveler?: TrustedTravelerInfo;
  preferredDepartureTime?: DepartureTime;
  layoverPreference?: LayoverPreference;
  alliance?: Alliance;

  // ===== Hotels =====
  hotelBrands?: string[];
  roomType?: RoomType;
  bedSize?: BedSize;
  floorPreference?: FloorPreference;
  viewPreference?: ViewPreference;
  smokingPreference?: SmokingPreference;
  pillowPreference?: PillowPreference;
  checkInPreference?: CheckTimePreference;
  checkOutPreference?: CheckTimePreference;
  hotelAmenities?: string[];
  hotelLoyalty?: LoyaltyEntry[];
  hotelBudgetMin?: number;
  hotelBudgetMax?: number;

  // ===== Rental cars =====
  carRentalCompanies?: string[];
  carClass?: CarClass;
  carTransmission?: CarTransmission;
  carFuelType?: CarFuelType;
  carFeatures?: string[];
  carInsurance?: CarInsurance;
  carPickup?: CarPickup;
  carLoyalty?: LoyaltyEntry[];

  // ===== Food & dining =====
  cuisinesLiked?: string[];
  cuisinesDisliked?: string[];
  dietaryRestrictions?: string[];
  spiceTolerance?: SpiceTolerance;
  mealBudget?: MealBudget;
  diningStyles?: string[];
  alcohol?: AlcoholPreference;
  coffee?: CoffeePreference;
  breakfast?: BreakfastPreference;
  foodAllergies?: string;

  // ===== Activities & interests =====
  photographyInterest?: boolean;
  shoppingInterest?: ShoppingInterest;
  nightlifeInterests?: string[];
  culturalInterests?: string[];
  outdoorInterests?: string[];

  // ===== Budget =====
  dailyBudgetUsd?: number;
  preferredCurrency?: string;

  // ===== Safety / admin =====
  emergencyContacts?: EmergencyContact[];
  insurance?: InsuranceInfo;

  // ===== Free-form notes =====
  notes?: string;

  updatedAt?: string;
};

export type Trip = {
  id: string;
  destination: string;
  origin: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budget?: number;
  vibes: string[];
  intent?: TripIntent;
  withKids?: boolean;
  accessibility?: boolean;
  carbonAware?: boolean;
  itinerary: ItineraryDay[];
  selectedFlightId?: string;
  selectedHotelId?: string;
  transportMode: TransportMode;
  invitees?: { email: string; name?: string; status: "pending" | "joined" }[];
  expenses?: TripExpense[];
  preferences?: TripPreferences;
  createdAt: string;
};

export type TripExpense = {
  id: string;
  description: string;
  amountUsd: number;
  paidBy: string;
  splitAmong: string[];
  date: string;
};
