"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

// Five tabs with a centered Capture FAB. Mirrors how users actually move
// through the app — Plan/Explore are the two outbound modes; Trips/Profile
// are personal; Catch a Moment is the action-anywhere center.
const TABS = [
  { href: "/plan", label: "Plan", icon: "✦" },
  { href: "/explore", label: "Explore", icon: "◇" },
  { kind: "fab" as const, href: "/profile/capture", label: "Catch", icon: "📷" },
  { href: "/messages", label: "DMs", icon: "✉" },
  { href: "/profile", label: "Profile", icon: "○" },
];

export default function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const { user, ready } = useAuth();

  // Hide on landing for unauthed visitors so the hero CTA isn't covered.
  if (!ready || !user) return null;

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-strong)] backdrop-blur-xl"
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
                className={`flex flex-col items-center justify-center py-2.5 text-[10px] font-mono tracking-[0.14em] uppercase transition ${
                  active
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                <span className={`text-lg leading-none ${active ? "text-glow" : ""}`}>
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
