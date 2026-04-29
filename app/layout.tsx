import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import Nav from "@/components/Nav";
import { AuthProvider } from "@/components/AuthProvider";
import { SwRegister } from "@/components/SwRegister";
import CookieBanner from "@/components/CookieBanner";
import ClientObservability from "@/components/ClientObservability";
import AssistantWidget from "@/components/AssistantWidget";
import Toaster from "@/components/Toaster";
import Shortcuts from "@/components/Shortcuts";
import MobileTabBar from "@/components/MobileTabBar";
import InstallPrompt from "@/components/InstallPrompt";
import PushOptInPrompt from "@/components/PushOptInPrompt";
import GlobalSearch from "@/components/GlobalSearch";
import SupabaseSocialBoot from "@/components/SupabaseSocialBoot";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Voyage Redesign / Direction A — Space Grotesk is the primary face.
// Self-hosted via next/font so we get optimal CLS + no FOUT, and the CSS
// variable is consumed by app/globals.css which sets it as the default
// font-family on html, body.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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

// Apple-touch-startup-image entries — one per common iPhone/iPad pixel size
// and orientation. Each one points at /apple-icon (the dynamic ImageResponse
// route) so we don't have to commit raster splash assets. Track F owns the
// rest of the head metadata (og/twitter/sitemap); only PWA-related links
// belong here.
const APPLE_SPLASH = [
  // iPhone 14/15/16 family — Pro & Pro Max
  { media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  { media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  // iPhone 12/13/14 standard
  { media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  // iPhone 11 / XR
  { media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  // iPhone X / Xs / 11 Pro
  { media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
  // iPhone 8 / SE2
  { media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  // iPad Pro 12.9"
  { media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  // iPad Pro 11"
  { media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
  // iPad standard
  { media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
];

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
  icons: {
    // Apple-touch-startup-image splashes — one entry per device size/orientation.
    // Track F owns og/twitter; we only own PWA + apple PWA chrome.
    other: APPLE_SPLASH.map((s) => ({
      rel: "apple-touch-startup-image",
      url: "/apple-icon",
      media: s.media,
    })),
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
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <AuthProvider>
          <SwRegister />
          <ClientObservability />
          <SupabaseSocialBoot />
          {/* Track 2: shows when an admin is impersonating a user. Renders */}
          {/* nothing for everyone else, so the layout cost is essentially  */}
          {/* zero outside of an active impersonation session.              */}
          <ImpersonationBanner />
          <Nav />
          <main className="flex-1 pb-20 lg:pb-0">{children}</main>
          <footer className="border-t border-[var(--border)] px-6 py-10 text-xs text-[var(--muted)] font-mono">
            <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div>
                <div className="font-semibold text-[var(--foreground)] tracking-[0.18em]">
                  // VOYAGE · {new Date().getFullYear()}
                </div>
                <div className="mt-2 text-[var(--muted)]">
                  Plan smarter trips. Built for everyone.
                </div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 md:justify-center text-[11px]">
                <Link href="/labs" className="hover:text-white">
                  Labs
                </Link>
                <Link href="/developers" className="hover:text-white">
                  Developers
                </Link>
                <Link href="/legal/terms" className="hover:text-white">
                  Terms
                </Link>
                <Link href="/legal/privacy" className="hover:text-white">
                  Privacy
                </Link>
                <Link href="/legal/cookies" className="hover:text-white">
                  Cookies
                </Link>
                <a href="/api/health" className="hover:text-white">
                  Status
                </a>
              </div>
              <div className="flex md:justify-end items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
                <span>SYS.OK · v0.1.0</span>
              </div>
            </div>
          </footer>
          <CookieBanner />
          <AssistantWidget />
          <Toaster />
          <Shortcuts />
          <MobileTabBar />
          <InstallPrompt />
          <PushOptInPrompt />
          <GlobalSearch />
        </AuthProvider>
      </body>
    </html>
  );
}
