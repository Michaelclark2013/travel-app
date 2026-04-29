"use client";

// First-run 3-step tour for /plan. Saves a "seen" flag so it doesn't replay.
// Manually re-launchable via window.dispatchEvent(new Event("voyage:replay-tour"))
// or by clearing localStorage.

import { useEffect, useState } from "react";

const KEY = "voyage:tour-seen";

const STEPS = [
  {
    title: "Tell us where",
    body: "Type a city, IATA code, or even an address. We figure out the rest.",
  },
  {
    title: "Tweak the vibe",
    body: "Pick what you're into — your prefs auto-save for next time.",
  },
  {
    title: "Build it",
    body: "Hit the button and we generate a day-by-day plan in under a second.",
  },
];

export default function CoachTour() {
  const [step, setStep] = useState<number>(-1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(KEY)) {
      // Defer so the form is rendered first.
      const t = window.setTimeout(() => setStep(0), 800);
      return () => window.clearTimeout(t);
    }
    const replay = () => setStep(0);
    window.addEventListener("voyage:replay-tour", replay);
    return () => window.removeEventListener("voyage:replay-tour", replay);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, "1");
    }
    setStep(-1);
  }

  function next() {
    if (step + 1 >= STEPS.length) {
      dismiss();
    } else {
      setStep(step + 1);
    }
  }

  if (step < 0) return null;
  const s = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-4 pointer-events-none"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onClick={dismiss}
        aria-hidden
      />
      <div
        className="relative pointer-events-auto w-full max-w-sm rounded-2xl border border-[var(--accent)]/40 shadow-2xl p-5 backdrop-blur-xl"
        style={{ background: "var(--background-soft)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--accent)] uppercase">
            // VOYAGE · TOUR · {step + 1}/{STEPS.length}
          </div>
          <button
            onClick={dismiss}
            aria-label="Skip"
            className="text-[var(--muted)] hover:text-white text-sm"
          >
            Skip
          </button>
        </div>
        <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
        <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">
          {s.body}
        </p>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full ${
                  i <= step ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              />
            ))}
          </div>
          <button
            onClick={next}
            className="btn-primary px-4 py-1.5 text-sm font-medium"
          >
            {step + 1 === STEPS.length ? "Got it" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
