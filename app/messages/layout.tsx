// Track F (SEO): metadata wrapper for /messages — auth-gated DMs, never
// indexed. Subroute /messages/[threadId] inherits this metadata.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages",
  description: "Your Voyage messages.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
