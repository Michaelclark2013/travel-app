// Mobile bottom tab bar — Voyage Redesign / Direction A "Slate Teal".
//
// The visual model is a floating black ink pill anchored above the home
// indicator (instead of a full-bleed translucent strip). The pill has its
// own rounded silhouette, a slate-teal Catch FAB centered with a notch
// cutout into the pill so the FAB pokes up from the bar, and labels are
// lowercased Space Grotesk per the design language. Active tab is colored
// slate teal; inactive tabs sit in a muted off-white that reads on ink.
//
// Behaviour preserved from prior versions:
//   - light haptic on tap (Android only — iOS Safari ignores Vibration API)
//   - scroll-down-to-hide / scroll-up-to-reveal, rAF-debounced
//   - safe-area-bottom inset so the pill floats above the home indicator
//   - 5 tabs (Plan / Explore / Catch / DMs / Profile) — Catch is a FAB

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

const TABS = [
  { href: "/plan", label: "plan", icon: "✦" },
  { href: "/explore", label: "explore", icon: "◇" },
  { kind: "fab" as const, href: "/profile/capture", label: "catch", icon: "+" },
  { href: "/messages", label: "dms", icon: "✉" },
  { href: "/profile", label: "me", icon: "○" },
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
      className={`lg:hidden fixed inset-x-3 bottom-3 z-40 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        hidden ? "translate-y-[calc(100%+1rem)]" : "translate-y-0"
      }`}
      style={{
        // Float above the home indicator instead of being eaten by it.
        marginBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Primary"
    >
      {/* The actual pill — flat ink slab with a soft drop shadow. */}
      <ul
        className="grid grid-cols-5 items-end px-1 py-2"
        style={{
          background: "var(--foreground)", // ink
          color: "var(--background)", // cream
          borderRadius: 9999,
          boxShadow:
            "0 18px 40px -12px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.18)",
        }}
      >
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
                  className="flex items-center justify-center transition active:scale-95"
                  style={{
                    width: 44,
                    height: 44,
                    margin: "-22px 0 0",
                    borderRadius: 9999,
                    background: "var(--accent)",
                    color: "var(--accent-foreground)",
                    // 4px ink ring so the FAB looks like it's punched through
                    // the pill, matching the design's notch effect.
                    border: "4px solid var(--foreground)",
                    boxShadow: "0 6px 18px rgba(58,90,107,0.45)",
                  }}
                >
                  <Camera size={18} strokeWidth={2.25} />
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                onClick={tap}
                aria-label={t.label}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold tracking-[0.02em] transition-transform duration-200 active:scale-90"
                style={{
                  color: active
                    ? "var(--accent)"
                    : "rgba(244, 241, 232, 0.55)",
                }}
              >
                <span
                  className="leading-none transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                  style={{
                    fontSize: 16,
                    transform: active ? "scale(1.1)" : "scale(1)",
                  }}
                >
                  {t.icon}
                </span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
