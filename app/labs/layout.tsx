// Track F (SEO): metadata for /labs (experimental features showcase).

import type { Metadata } from "next";
import { abs } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Labs",
  description: "Experimental features we're cooking inside Voyage.",
  alternates: { canonical: abs("/labs") },
  openGraph: {
    type: "website",
    url: abs("/labs"),
    title: "Labs · Voyage",
    description: "Experimental features we're cooking inside Voyage.",
    siteName: "Voyage",
  },
  twitter: {
    card: "summary_large_image",
    title: "Labs · Voyage",
    description: "Experimental features we're cooking inside Voyage.",
    site: "@voyageapp",
  },
};

export default function LabsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
