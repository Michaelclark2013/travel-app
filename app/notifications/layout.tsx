// Track F (SEO): /notifications is auth-gated personal data — noindex.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Your Voyage notifications.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
