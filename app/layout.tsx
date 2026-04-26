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
