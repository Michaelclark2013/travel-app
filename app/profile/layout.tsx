// Track F (SEO): metadata wrapper for the auth-gated /profile page.
// Set robots: noindex/nofollow since the route contains personal data.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your profile",
  description: "Your Voyage profile, trips, and saved moments.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
