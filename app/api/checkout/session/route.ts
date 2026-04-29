// =============================================================================
// app/api/checkout/session/route.ts — Pro checkout session stub (Track D)
// =============================================================================
//
// WHAT
//   POST endpoint that the /pro page hits when a user clicks "Upgrade". Today
//   it's a STUB — returns { url: "/pro?status=stripe-not-wired", testMode: true }
//   when the Stripe secret isn't configured. When STRIPE_SECRET_KEY is set,
//   this should swap to a real Stripe Checkout Session creation (see template
//   below) and redirect the user to the hosted Checkout URL.
//
// WHY
//   We're shipping the paywall scaffolding ahead of the Stripe wire-up so
//   nothing breaks for visitors clicking "Upgrade" today, and the flip-on is
//   one paste of code + 4 env vars in Vercel.
//
// REQUEST BODY
//   { plan: "monthly" | "annual" }   (defaults to "monthly" if absent)
//
// RESPONSE
//   { url: string, testMode?: boolean }     200
//   { error: string }                       4xx
//
// ENV VARS THAT ACTIVATE THIS ROUTE
//   STRIPE_SECRET_KEY                 — server-only Stripe key, format sk_...
//   STRIPE_PRICE_MONTHLY              — price ID for the $7.99/mo plan
//   STRIPE_PRICE_ANNUAL               — price ID for the $59/yr plan
//   NEXT_PUBLIC_SITE_URL              — used to build success/cancel URLs
//   STRIPE_WEBHOOK_SECRET             — separate webhook handler reads this
//                                        (Track G owns /api/stripe/webhook)
//
// =============================================================================
// FLIP-ON TEMPLATE — when Stripe is added, replace the stub block with:
// -----------------------------------------------------------------------------
//   // Add `stripe` to package.json deps first.
//   import Stripe from "stripe";
//
//   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
//     apiVersion: "2025-04-30.basil",
//   });
//
//   const PRICE_BY_PLAN: Record<Plan, string | undefined> = {
//     monthly: process.env.STRIPE_PRICE_MONTHLY,
//     annual: process.env.STRIPE_PRICE_ANNUAL,
//   };
//
//   const price = PRICE_BY_PLAN[plan];
//   if (!price) {
//     return NextResponse.json(
//       { error: `No Stripe price configured for plan "${plan}"` },
//       { status: 500 }
//     );
//   }
//
//   const session = await stripe.checkout.sessions.create({
//     mode: "subscription",
//     line_items: [{ price, quantity: 1 }],
//     success_url: `${siteUrl}/pro?status=success&session_id={CHECKOUT_SESSION_ID}`,
//     cancel_url: `${siteUrl}/pro?status=canceled`,
//     allow_promotion_codes: true,
//     billing_address_collection: "auto",
//     // Optional: pass customer email if signed in
//     // customer_email: ...
//   });
//
//   return NextResponse.json({ url: session.url });
// =============================================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type Plan = "monthly" | "annual";

function isPlan(v: unknown): v is Plan {
  return v === "monthly" || v === "annual";
}

export async function POST(request: NextRequest) {
  let plan: Plan = "monthly";
  try {
    const body = await request.json().catch(() => ({}));
    if (isPlan(body.plan)) plan = body.plan;
  } catch {
    // ignore — fall through with default plan
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;

  // ----- STUB MODE -----
  // No Stripe key set → return a friendly redirect URL with a status banner.
  if (!stripeKey) {
    return NextResponse.json({
      url: "/pro?status=stripe-not-wired",
      testMode: true,
      plan,
    });
  }

  // ----- ARMED MODE -----
  // STRIPE_SECRET_KEY is present but the actual Stripe client isn't installed
  // yet (we're not adding the npm dep in this track). Surface a clear error
  // so the next track knows exactly what's missing.
  return NextResponse.json(
    {
      error:
        "STRIPE_SECRET_KEY is set but the Stripe client is not yet wired. " +
        "Install `stripe` and replace this branch with the FLIP-ON TEMPLATE " +
        "in the file header.",
    },
    { status: 501 }
  );
}
