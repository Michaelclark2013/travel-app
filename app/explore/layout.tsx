// Track F (SEO): metadata wrapper for /explore (the social feed). The page
// itself is "use client", so we hang static metadata off this server-component
// layout instead of exporting it from page.tsx.

import type { Metadata } from "next";
import { abs } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Real moments from real travelers. Plan a trip from anything that catches your eye.",
  alternates: { canonical: abs("/explore") },
  openGraph: {
    type: "website",
    url: abs("/explore"),
    title: "Explore · Voyage",
    description:
      "Real moments from real travelers. Plan a trip from anything that catches your eye.",
    siteName: "Voyage",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore · Voyage",
    description:
      "Real moments from real travelers. Plan a trip from anything that catches your eye.",
    site: "@voyageapp",
  },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
