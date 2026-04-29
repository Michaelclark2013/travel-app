import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { AuthProvider } from "@/components/AuthProvider";
import { SwRegister } from "@/components/SwRegister";
import MobileTabBar from "@/components/MobileTabBar";
import InstallPrompt from "@/components/InstallPrompt";
import PushOptInPrompt from "@/components/PushOptInPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  title: "Voyage — Plan trips with AI",
  description:
    "AI-powered travel planning. Find cheap flights, hotels, and build a day-by-day itinerary.",
  appleWebApp: {
    capable: true,
    title: "Voyage",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <AuthProvider>
          <SwRegister />
          <Nav />
          <main className="flex-1 pb-20 lg:pb-0">{children}</main>
          <footer className="border-t border-[var(--border)] px-6 py-8 text-xs text-[var(--muted)] font-mono">
            <div className="mx-auto max-w-6xl flex items-center justify-between flex-wrap gap-4">
              <span>// VOYAGE · {new Date().getFullYear()}</span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
                SYS.OK · v0.1.0
              </span>
            </div>
          </footer>
          <MobileTabBar />
          <InstallPrompt />
          <PushOptInPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}
