// Mobile bottom tab bar. Hidden on desktop. iOS-native polish:
//   - light haptic on tap (Android only — iOS Safari ignores Vibration API)
//   - active-state spring animation
//   - hides itself when the user scrolls down, comes back when they scroll up
// Honors the bottom safe-area inset so the bar floats above the iPhone
// home indicator instead of getting eaten by it.
//
// Five tabs with a centered Capture FAB. Mirrors how users actually move
// through the app — Plan/Explore are the two outbound modes; Trips/Profile
// are personal; Catch a Moment is the action-anywhere center.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

const TABS = [
  { href: "/plan", label: "Plan", icon: "✦" },
  { href: "/explore", label: "Explore", icon: "◇" },
  { kind: "fab" as const, href: "/profile/capture", label: "Catch", icon: "📷" },
  { href: "/messages", label: "DMs", icon: "✉" },
  { href: "/profile", label: "Profile", icon: "○" },
];

function tap() {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    // iOS Safari is a no-op here; Android responds with a light click.
    try {
      navigator.vibrate(8);
    } catch {
      /* vibration can throw on some embedded webviews — never fatal */
    }
  }
}

export default function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const { user, ready } = useAuth();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  // Scroll-down-to-hide: debounced via rAF, reveals as soon as the user
  // scrolls up by any amount or reaches the top.
  useEffect(() => {
    if (typeof window === "undefined") return;
    lastY.current = window.scrollY;
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (y < 32) {
          setHidden(false);
        } else if (delta > 8) {
          setHidden(true);
        } else if (delta < -8) {
          setHidden(false);
        }
        lastY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hide on landing for unauthed visitors so the hero CTA isn't covered.
  if (!ready || !user) return null;

  return (
    <nav
      className={`lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-strong)] backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
      style={{
        background: "var(--background-soft)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5 items-end">
        {TABS.map((t) => {
          const active =
            pathname === t.href || pathname.startsWith(t.href + "/");
          if ("kind" in t && t.kind === "fab") {
            return (
              <li key={t.href} className="flex justify-center">
                <Link
                  href={t.href}
                  onClick={tap}
                  aria-label="Catch a moment"
                  className="-mt-6 h-14 w-14 rounded-full btn-primary flex items-center justify-center shadow-2xl active:scale-95 transition"
                  style={{
                    boxShadow:
                      "0 0 0 4px var(--background), 0 12px 30px rgba(34,211,238,0.45)",
                  }}
                >
                  <Camera size={20} strokeWidth={2} />
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                onClick={tap}
                className={`flex flex-col items-center justify-center py-2.5 text-[10px] font-mono tracking-[0.14em] uppercase transition-transform duration-200 active:scale-90 ${
                  active
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                <span
                  className={`text-lg leading-none transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                    active ? "scale-110 text-glow" : "scale-100"
                  }`}
                >
                  {t.icon}
                </span>
                <span className="mt-1">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
