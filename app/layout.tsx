import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { AuthProvider } from "@/components/AuthProvider";
import { SwRegister } from "@/components/SwRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Site-wide metadata defaults. Per-route generateMetadata exports only need to
// override title/description/openGraph.images — other fields cascade from here.
//
// NOTE (Track F): og: + twitter: defaults live here. Track E owns
// appleWebApp / icons / manifest / theme-color (those are PWA-track concerns).
//
// `@voyageapp` is a placeholder Twitter handle — replace once the marketing
// account is registered and verified.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://travel-app-tan-gamma.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Voyage — Plan trips with AI",
    template: "%s · Voyage",
  },
  description:
    "AI-powered travel planning. Find cheap flights, hotels, and build a day-by-day itinerary.",
  applicationName: "Voyage",
  authors: [{ name: "Voyage" }],
  keywords: [
    "trip planner",
    "travel planning",
    "AI travel",
    "itinerary builder",
    "cheap flights",
    "hotel search",
    "travel inspiration",
  ],
  appleWebApp: {
    capable: true,
    title: "Voyage",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Voyage",
    url: SITE_URL,
    title: "Voyage — Plan trips with AI",
    description:
      "AI-powered travel planning. Find cheap flights, hotels, and build a day-by-day itinerary.",
    locale: "en_US",
    // Root opengraph-image.tsx fills in the image automatically — no need to
    // duplicate it here. Per-route opengraph-image.tsx files override.
  },
  twitter: {
    card: "summary_large_image",
    site: "@voyageapp", // placeholder — see note above.
    creator: "@voyageapp", // placeholder — see note above.
    title: "Voyage — Plan trips with AI",
    description:
      "AI-powered travel planning. Find cheap flights, hotels, and build a day-by-day itinerary.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#050507",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <SwRegister />
          <Nav />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[var(--border)] px-6 py-8 text-xs text-[var(--muted)] font-mono">
            <div className="mx-auto max-w-6xl flex items-center justify-between flex-wrap gap-4">
              <span>// VOYAGE · {new Date().getFullYear()}</span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
                SYS.OK · v0.1.0
              </span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
