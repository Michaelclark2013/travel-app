// Track F (SEO): sign-in is a passthrough launcher — keep it out of search
// results since it has zero indexable content and immediately redirects.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Launch Voyage.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
