"use client";

// Global keyboard shortcuts. Mounted once in layout.tsx; listens for keydowns
// outside form elements. Press `?` to see the cheat sheet.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const SHORTCUTS: Array<{ keys: string[]; label: string; href?: string; action?: "search" | "newTrip" | "help" }> = [
  { keys: ["?"], label: "Show this cheat sheet", action: "help" },
  { keys: ["/"], label: "Focus search / destination input", action: "search" },
  { keys: ["n"], label: "New trip", href: "/plan" },
  { keys: ["g", "h"], label: "Go home", href: "/" },
  { keys: ["g", "t"], label: "Go to trips", href: "/trips" },
  { keys: ["g", "f"], label: "Go to flights", href: "/flights" },
  { keys: ["g", "o"], label: "Go to hotels", href: "/hotels" },
  { keys: ["g", "i"], label: "Go to inspire", href: "/inspire" },
  { keys: ["g", "w"], label: "Go to wallet", href: "/wallet" },
];

export default function Shortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  useEffect(() => {
    function shouldIgnore(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (t.isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (shouldIgnore(e) && e.key !== "/") return;

      // `?` → toggle help
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      // `/` → open global search overlay (works from any page).
      if (e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new Event("voyage:open-search"));
        return;
      }

      if (e.key === "Escape") {
        setOpen(false);
        setPendingG(false);
        return;
      }

      // Single-key shortcuts (n, ?)
      if (e.key === "n") {
        e.preventDefault();
        router.push("/plan");
        return;
      }

      // Two-key chord starting with `g`
      if (e.key === "g") {
        setPendingG(true);
        window.setTimeout(() => setPendingG(false), 1500);
        return;
      }

      if (pendingG) {
        const map: Record<string, string> = {
          h: "/",
          t: "/trips",
          f: "/flights",
          o: "/hotels",
          i: "/inspire",
          w: "/wallet",
        };
        const dest = map[e.key];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        setPendingG(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingG, router]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="relative w-full max-w-md surface rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
              // KEYBOARD
            </div>
            <h2 className="text-lg font-semibold mt-1">Shortcuts</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-[var(--muted)] hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-[var(--muted)]">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--card-strong)] font-mono text-[11px]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)]">
          Press <kbd className="px-1 border border-[var(--border-strong)]">?</kbd> any time to reopen.
        </div>
      </div>
    </div>
  );
}
