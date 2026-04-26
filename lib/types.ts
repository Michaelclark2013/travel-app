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
