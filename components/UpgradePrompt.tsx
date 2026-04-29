"use client";

// =============================================================================
// components/UpgradePrompt.tsx — Reusable Pro upsell modal (Track D)
// =============================================================================
//
// WHAT
//   A bottom-sheet on mobile / centered modal on desktop. Shows when a soft
//   gate fires (saved-trip cap, AI message cap, Trip Doctor scan cap, etc).
//   Copy adapts based on `reason`. CTA goes to /pro.
//
// WHY
//   Track D ships the paywall scaffolding without actually charging anyone yet
//   (Stripe is not wired). When isPro() flips to false in the future, every
//   call site already has the upsell wired in — no code changes needed at the
//   gate sites.
//
// USAGE
//   import UpgradePrompt, { type UpgradeReason } from "@/components/UpgradePrompt";
//   const [open, setOpen] = useState(false);
//   <UpgradePrompt open={open} onClose={() => setOpen(false)} reason="saved-trips" />
//
// ENV VARS
//   None — this is presentation only. The decision to *show* it lives at the
//   gate sites and is governed by lib/pro.ts (isPro()).
// =============================================================================

import Link from "next/link";
import { useEffect } from "react";
import { Sparkles, X } from "lucide-react";

export type UpgradeReason =
  | "saved-trips"
  | "ai-agent"
  | "trip-doctor"
  | "generic";

const COPY: Record<
  UpgradeReason,
  { title: string; body: string; bullet: string }
> = {
  "saved-trips": {
    title: "You've hit the free trip limit",
    body: "Free accounts can save up to 3 trips. Upgrade to Voyage Pro for unlimited saved trips, plus everything else.",
    bullet: "Unlimited saved trips",
  },
  "ai-agent": {
    title: "AI quota reached for this session",
    body: "Free accounts get 5 AI assistant messages per session. Upgrade to Voyage Pro for unlimited Claude-powered planning, scans, and rebooks.",
    bullet: "Unlimited AI assistant",
  },
  "trip-doctor": {
    title: "Trip Doctor — daily scan used",
    body: "Free accounts get one Trip Doctor scan per trip per day. Upgrade to Voyage Pro for unlimited re-scans whenever your itinerary changes.",
    bullet: "Unlimited Trip Doctor scans",
  },
  generic: {
    title: "You've hit the free limit",
    body: "Voyage Pro unlocks unlimited trips, unlimited AI assistant, and Trip Doctor on tap.",
    bullet: "Everything in Voyage, unlimited",
  },
};

const SHARED_PERKS = [
  "Insurance free at checkout",
  "Priority Claude responses",
  "Early access to Creator Marketplace",
];

export default function UpgradePrompt({
  open,
  onClose,
  reason = "generic",
}: {
  open: boolean;
  onClose: () => void;
  reason?: UpgradeReason;
}) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = COPY[reason];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-prompt-title"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border border-[var(--border-strong)] overflow-hidden"
        style={{ background: "var(--background-soft)" }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div
            className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-soft), transparent)",
              border: "1px solid var(--accent)",
            }}
            aria-hidden
          >
            <Sparkles size={18} className="text-[var(--accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
              // VOYAGE · PRO
            </div>
            <h2
              id="upgrade-prompt-title"
              className="text-lg font-semibold mt-1 leading-tight"
            >
              {copy.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-[var(--muted)] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-2 text-sm text-[var(--muted)]">
          {copy.body}
        </div>

        {/* Perks */}
        <ul className="px-5 mt-4 space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <span className="text-[var(--accent)]" aria-hidden>
              ✓
            </span>
            <span className="text-white font-medium">{copy.bullet}</span>
          </li>
          {SHARED_PERKS.map((perk) => (
            <li key={perk} className="flex items-center gap-2">
              <span className="text-[var(--accent)]" aria-hidden>
                ✓
              </span>
              <span>{perk}</span>
            </li>
          ))}
        </ul>

        {/* Footer / CTAs */}
        <div className="mt-5 px-5 pb-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            onClick={onClose}
            className="text-sm text-[var(--muted)] hover:text-white"
          >
            Maybe later
          </button>
          <Link
            href={`/pro?reason=${encodeURIComponent(reason)}`}
            onClick={onClose}
            className="btn-primary px-5 py-2.5 text-sm text-center"
          >
            See Voyage Pro →
          </Link>
        </div>
      </div>
    </div>
  );
}
