// Track F (SEO): sign-up is a passthrough — keep it out of search results.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Join Voyage.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
