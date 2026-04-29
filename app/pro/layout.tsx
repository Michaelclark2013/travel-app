// Track F (SEO): /pro is Voyage's upgrade landing page (owned by Track D).
// Track F adds metadata + a schema.org/Product blob so the upgrade tier
// shows up in rich-result search experiments. Pricing is duplicated from
// app/pro/page.tsx — keep these in sync if Track D changes the dollar values.

import type { Metadata } from "next";
import { abs, productLd } from "@/lib/seo";

const TITLE = "Voyage Pro — unlimited AI trips, smart deals, and more";
const DESCRIPTION =
  "Upgrade to Voyage Pro for unlimited AI itineraries, smarter price-watch alerts, advanced loyalty optimization, and the upcoming Creator Marketplace.";
const URL = abs("/pro");

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Voyage",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    site: "@voyageapp",
  },
};

export default function ProLayout({ children }: { children: React.ReactNode }) {
  // Product schema mirrors the placeholder $7.99/mo + $59/yr tiers shown on
  // app/pro/page.tsx. The annual offer is also emitted as a separate Product
  // sibling so each tier is independently discoverable in rich results.
  const monthlyLd = productLd({
    name: "Voyage Pro · Monthly",
    description: DESCRIPTION,
    url: URL,
    priceUsd: 7.99,
    recurrence: "P1M",
  });
  const annualLd = productLd({
    name: "Voyage Pro · Annual",
    description: DESCRIPTION,
    url: URL,
    priceUsd: 59,
    recurrence: "P1Y",
  });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: monthlyLd }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: annualLd }}
      />
      {children}
    </>
  );
}
