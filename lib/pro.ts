"use client";

// =============================================================================
// lib/pro.ts — Voyage Pro entitlement helper (Track D)
// =============================================================================
//
// WHAT
//   Tiny client-side gate for the Pro paywall. `isPro()` returns whether the
//   current visitor should be treated as a Pro subscriber; `setPro(boolean)` is
//   a dev/QA helper that flips the localStorage flag.
//
// WHY
//   Stripe is not yet wired in this build (no STRIPE_SECRET_KEY, no publishable
//   key, no price IDs). We're shipping the *scaffolding* — pricing page,
//   UpgradePrompt, soft gates — so flipping the paywall on later is one env
//   var + a Stripe webhook away. Until then, EVERYONE is Pro and no gate ever
//   fires.
//
// THE GATE-OFF RULE  (decision flagged in the changelog)
//   `isPro()` returns `true` when ANY of the following is true:
//     1. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is unset (Stripe isn't wired) —
//        this is the master kill-switch. As long as we don't have Stripe
//        configured, Pro is effectively free for everyone.
//     2. NEXT_PUBLIC_PRO_DEFAULT_ON is set to "1"/"true" (developer override —
//        useful for previewing Pro UI without paying).
//     3. localStorage["voyage:pro"] === "1" (set by setPro(true) for dev/QA,
//        and eventually by the post-checkout success handler).
//
//   So: shipping today doesn't lock anyone out. The moment we set a Stripe
//   publishable key in Vercel, the gate becomes real and rule (3) is the only
//   path to Pro.
//
// ENV VARS THAT ACTIVATE THIS FILE
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  — presence flips the gate ON.
//   NEXT_PUBLIC_PRO_DEFAULT_ON          — "1"/"true" forces Pro on for dev.
//   (Server-side Stripe vars — STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY,
//    STRIPE_PRICE_ANNUAL, STRIPE_WEBHOOK_SECRET — are read by the checkout
//    route handler, not here.)
// =============================================================================

const STORAGE_KEY = "voyage:pro";

function readBoolEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * True if the visitor should be treated as a Voyage Pro subscriber.
 *
 * SSR-safe: returns `true` on the server (gate is OFF until Stripe is wired,
 * and being permissive during SSR avoids server/client paywall flicker).
 */
export function isPro(): boolean {
  // Master kill-switch: if Stripe isn't wired, nobody is gated.
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) return true;

  // Dev override.
  if (readBoolEnv(process.env.NEXT_PUBLIC_PRO_DEFAULT_ON)) return true;

  // Server-side: be permissive. The client will re-render and apply the real
  // gate in the next paint.
  if (typeof window === "undefined") return true;

  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Dev/QA helper — flips the localStorage flag. In production this would be
 * called from the post-checkout success page after we verify the session
 * server-side. For now it's manual.
 */
export function setPro(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    // Notify any open tabs.
    window.dispatchEvent(new CustomEvent("voyage:pro-changed"));
  } catch {
    // ignore
  }
}

/**
 * True iff the paywall is "armed" — i.e. Stripe is wired so non-Pro users
 * actually hit gates. Useful for showing/hiding the Upgrade nav link.
 */
export function paywallArmed(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
}
