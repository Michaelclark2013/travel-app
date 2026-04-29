// Track F (SEO): metadata for /plan (the AI trip-planning intake form).

import type { Metadata } from "next";
import { abs } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Plan a trip",
  description: "Tell Voyage where you're headed and we'll build a day-by-day itinerary.",
  alternates: { canonical: abs("/plan") },
  openGraph: {
    type: "website",
    url: abs("/plan"),
    title: "Plan a trip · Voyage",
    description: "Tell Voyage where you're headed and we'll build a day-by-day itinerary.",
    siteName: "Voyage",
  },
  twitter: {
    card: "summary_large_image",
    title: "Plan a trip · Voyage",
    description: "Tell Voyage where you're headed and we'll build a day-by-day itinerary.",
    site: "@voyageapp",
  },
};

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
