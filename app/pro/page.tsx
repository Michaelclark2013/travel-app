"use client";

// =============================================================================
// app/pro/page.tsx — Voyage Pro upgrade landing page (Track D)
// =============================================================================
//
// WHAT
//   The /pro marketing + checkout entry point. Hero → pricing tiles (monthly +
//   annual) → feature comparison table → coming-soon Creator Marketplace
//   teaser → FAQ → footer.
//
// WHY
//   When the paywall flips on, every UpgradePrompt in the app links here.
//   Today the page renders fine and the "Upgrade" buttons hit the stub
//   /api/checkout/session route which returns a "stripe-not-wired" status,
//   so visitors see a friendly explainer instead of a broken redirect.
//
// PRICING — these dollar values are PLACEHOLDERS owned by the GTM team.
//   $7.99 / month and $59 / year. They round-trip through the checkout API as
//   plan IDs ("monthly" / "annual"), so changing the price doesn't require a
//   client deploy — just a Stripe price + an env var.
//
// SITEMAP
//   TODO(track-f): add "/pro" to app/sitemap.ts. Track F owns sitemap
//   generation; not patching it from here to avoid a merge conflict.
//
// ENV VARS THAT ACTIVATE THIS PAGE
//   None for the page itself. The checkout button hits /api/checkout/session
//   which is governed by:
//     STRIPE_SECRET_KEY               — server-only, enables real checkout.
//     STRIPE_PRICE_MONTHLY            — Stripe price ID for $7.99/mo plan.
//     STRIPE_PRICE_ANNUAL             — Stripe price ID for $59/yr plan.
//     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — also flips lib/pro.ts gate ON.
//     STRIPE_WEBHOOK_SECRET           — for the webhook handler (not in this
//                                        track; Track G).
// =============================================================================

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Sparkles } from "lucide-react";

type Plan = "monthly" | "annual";

const PRICING: Record<
  Plan,
  { label: string; priceUsd: number; per: string; subline: string; save?: string }
> = {
  monthly: {
    label: "Monthly",
    priceUsd: 7.99,
    per: "/ month",
    subline: "Cancel anytime.",
  },
  annual: {
    label: "Annual",
    priceUsd: 59,
    per: "/ year",
    subline: "Two months free.",
    save: "Save 38%",
  },
};

// Free vs Pro feature matrix. Source-of-truth lives here so it stays in sync
// with the soft gates in trips/list, AssistantWidget, TripDoctor.
const FEATURES: { label: string; free: string; pro: string }[] = [
  { label: "Saved trips", free: "Up to 3", pro: "Unlimited" },
  { label: "AI assistant messages", free: "5 / session", pro: "Unlimited" },
  { label: "Trip Doctor scans", free: "1 / day", pro: "Unlimited" },
  { label: "Itinerary planner", free: "Yes", pro: "Yes" },
  { label: "Multi-stop trips", free: "Yes", pro: "Yes" },
  { label: "Travel insurance", free: "Available", pro: "Free at checkout" },
  { label: "Carbon offsets", free: "Available", pro: "50% off" },
  { label: "Priority Claude responses", free: "—", pro: "Yes" },
  { label: "Creator Marketplace", free: "—", pro: "Early access (Q3 2026)" },
  { label: "Support", free: "Community", pro: "Priority email" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. Pro is month-to-month or annual — there's no commitment. If you cancel, you keep Pro until the end of your current period.",
  },
  {
    q: "What happens to my saved trips if I downgrade?",
    a: "Nothing — they all stay. You just won't be able to create new ones past the 3-trip free cap until you upgrade again.",
  },
  {
    q: "Do you charge for the AI assistant separately?",
    a: "No. Pro includes unlimited Claude-powered planning at no extra cost. We absorb the inference bill.",
  },
  {
    q: "Is there a student or creator discount?",
    a: "Not yet — but we're working on a Creator tier launching with the Marketplace in Q3 2026. Sign up for the waitlist on this page.",
  },
  {
    q: "Refund policy?",
    a: "Full refund on annual plans within 14 days, no questions asked. Monthly plans are non-refundable but cancel cleanly.",
  },
];

export default function ProPage() {
  // useSearchParams() forces client-side bailout — wrap in Suspense so the
  // rest of the page can prerender (Next 16 requirement).
  return (
    <Suspense fallback={null}>
      <ProPageInner />
    </Suspense>
  );
}

function ProPageInner() {
  const params = useSearchParams();
  const status = params.get("status");
  const reason = params.get("reason");
  const [plan, setPlan] = useState<Plan>("annual");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (status === "stripe-not-wired") {
      setBanner(
        "Stripe isn't wired up in this build yet — your subscription would be processed here. Watch this space."
      );
    } else if (status === "success") {
      setBanner("You're Pro now. Welcome aboard.");
    } else if (status === "canceled") {
      setBanner("Checkout canceled — no charge. Come back anytime.");
    }
  }, [status]);

  async function startCheckout() {
    setBusy(true);
    try {
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        setBanner("Couldn't start checkout. Please try again.");
      }
    } catch {
      setBanner("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:py-16">
      {/* Status banner */}
      {banner && (
        <div className="mb-6 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm">
          {banner}
        </div>
      )}

      {/* Reason banner — when arrived from an UpgradePrompt */}
      {reason && !banner && (
        <div className="mb-6 rounded-xl border border-[var(--border-strong)] bg-[var(--card-strong)] px-4 py-3 text-sm text-[var(--muted)]">
          You were redirected here from a soft cap. Upgrade to remove it.
        </div>
      )}

      {/* Hero */}
      <section className="text-center">
        <div className="font-mono text-[10px] tracking-[0.24em] text-[var(--accent)] uppercase inline-flex items-center gap-2">
          <Sparkles size={12} />
          // VOYAGE · PRO
        </div>
        <h1 className="mt-4 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
          Travel like you mean it.
        </h1>
        <p className="mt-5 text-base md:text-lg text-[var(--muted)] max-w-xl mx-auto">
          Unlimited trips, unlimited Claude, free travel insurance, and early
          access to the Creator Marketplace. One subscription. Cancel anytime.
        </p>
      </section>

      {/* Pricing tiles */}
      <section
        aria-labelledby="pricing-heading"
        className="mt-10 md:mt-14 grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <h2 id="pricing-heading" className="sr-only">
          Pricing
        </h2>
        {(["monthly", "annual"] as const).map((p) => {
          const tile = PRICING[p];
          const active = plan === p;
          return (
            <button
              key={p}
              onClick={() => setPlan(p)}
              aria-pressed={active}
              className={`text-left rounded-2xl border p-6 transition ${
                active
                  ? "bg-[var(--accent-soft)] border-[var(--accent)]"
                  : "bg-[var(--card-strong)] border-[var(--border)] hover:border-[var(--border-strong)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted)]">
                  {tile.label}
                </div>
                {tile.save && (
                  <span className="text-[10px] font-mono tracking-wider text-[var(--accent)]">
                    {tile.save}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl md:text-5xl font-semibold tracking-tight">
                  ${tile.priceUsd}
                </span>
                <span className="text-sm text-[var(--muted)]">{tile.per}</span>
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                {tile.subline}
              </div>
            </button>
          );
        })}
      </section>

      <div className="mt-6 flex justify-center">
        <button
          onClick={startCheckout}
          disabled={busy}
          className="btn-primary px-8 py-3 text-base disabled:opacity-50"
        >
          {busy
            ? "Starting checkout…"
            : `Upgrade — $${PRICING[plan].priceUsd} ${PRICING[plan].per.trim()}`}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-[var(--muted)]">
        Secure checkout via Stripe. Taxes calculated at checkout.
      </p>

      {/* Feature comparison */}
      <section
        aria-labelledby="compare-heading"
        className="mt-16"
      >
        <h2
          id="compare-heading"
          className="text-2xl md:text-3xl font-semibold tracking-tight"
        >
          What's in it
        </h2>
        <div className="mt-5 surface rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--card-strong)]">
                <th className="text-left px-4 py-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted)]">
                  Feature
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted)]">
                  Free
                </th>
                <th className="text-left px-4 py-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--accent)]">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f, i) => (
                <tr
                  key={f.label}
                  className={
                    i < FEATURES.length - 1
                      ? "border-b border-[var(--border)]"
                      : ""
                  }
                >
                  <td className="px-4 py-3 font-medium">{f.label}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{f.free}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Check size={14} className="text-[var(--accent)]" />
                      <span>{f.pro}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Creator Marketplace teaser */}
      <section
        aria-labelledby="marketplace-heading"
        className="mt-16 surface rounded-2xl p-6 md:p-8"
      >
        <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--accent)]">
          // COMING Q3 2026
        </div>
        <h2
          id="marketplace-heading"
          className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight"
        >
          Creator Marketplace
        </h2>
        <p className="mt-3 text-[var(--muted)] max-w-2xl">
          Sell your trips, earn 80%. Pro members get to list itineraries on the
          Voyage Marketplace before it opens to the public — keep 80% of every
          sale, with built-in royalties when buyers re-share.
        </p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {[
            { k: "80%", v: "Creator share" },
            { k: "Q3 '26", v: "Public launch" },
            { k: "Pro only", v: "Early access" },
          ].map((s) => (
            <div
              key={s.v}
              className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] px-4 py-3"
            >
              <div className="text-2xl font-semibold tracking-tight">
                {s.k}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className="mt-16">
        <h2
          id="faq-heading"
          className="text-2xl md:text-3xl font-semibold tracking-tight"
        >
          Frequently asked
        </h2>
        <dl className="mt-5 space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-[var(--border)] bg-[var(--card-strong)] px-4 py-3"
            >
              <summary className="cursor-pointer flex items-center justify-between gap-4 list-none">
                <dt className="font-medium text-sm">{item.q}</dt>
                <span
                  className="text-[var(--muted)] group-open:rotate-45 transition-transform"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <dd className="mt-2 text-sm text-[var(--muted)]">{item.a}</dd>
            </details>
          ))}
        </dl>
      </section>

      {/* Footer */}
      <footer className="mt-16 pt-8 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="text-[var(--muted)]">
          Voyage Pro · pricing in USD · taxes calculated at checkout
        </div>
        <nav className="flex flex-wrap gap-4">
          <Link href="/legal/terms" className="text-[var(--muted)] hover:text-white">
            Terms
          </Link>
          <Link href="/legal/privacy" className="text-[var(--muted)] hover:text-white">
            Privacy
          </Link>
          <Link href="/legal/cookies" className="text-[var(--muted)] hover:text-white">
            Cookies
          </Link>
          <Link href="/" className="text-[var(--muted)] hover:text-white">
            Home
          </Link>
        </nav>
      </footer>
    </div>
  );
}
