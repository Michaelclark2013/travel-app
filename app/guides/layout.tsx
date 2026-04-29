// Track F (SEO): metadata for /guides (curated city guides).

import type { Metadata } from "next";
import { abs } from "@/lib/seo";

export const metadata: Metadata = {
  title: "City guides",
  description: "Curated travel guides — what to eat, see, and skip.",
  alternates: { canonical: abs("/guides") },
  openGraph: {
    type: "website",
    url: abs("/guides"),
    title: "Guides · Voyage",
    description: "Curated travel guides — what to eat, see, and skip.",
    siteName: "Voyage",
  },
  twitter: {
    card: "summary_large_image",
    title: "Guides · Voyage",
    description: "Curated travel guides — what to eat, see, and skip.",
    site: "@voyageapp",
  },
};

export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
