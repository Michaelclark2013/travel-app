// lib/admin/pricing-flag.ts — Track 6 pricing experiment helper.
//
// WHAT
//   getActivePriceIds(userId) → { monthly, annual }
//   Consults `pricing.experiment` (a cohort or percentage flag) to decide
//   which Stripe price IDs to serve. Returns env defaults when no flag is
//   defined or evaluation is false.
//
// WHY
//   Pricing experiments are a high-stakes A/B: if we hardcode the price IDs
//   in Stripe routes, swapping them out for an experiment requires a deploy.
//   This helper lets ops flip the flag (with cohort or percentage rollout)
//   and the next call picks up the new IDs through the standard 5s cache.
//
// FLAG SHAPE
//   key:   "pricing.experiment"
//   kind:  "boolean" | "percentage" | "cohort"
//   value: { ...whatever the kind needs, e.g. {percent: 25} or {on: true} }
//   target (cohort only): the cohort rules.
//
//   Per the brief, when the flag evaluates TRUE for the user we return the
//   experiment price IDs from STRIPE_PRICE_MONTHLY_EXPERIMENT /
//   STRIPE_PRICE_ANNUAL_EXPERIMENT. Otherwise we return the defaults from
//   STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL.
//
// ENV VARS
//   STRIPE_PRICE_MONTHLY              — control cohort monthly price id
//   STRIPE_PRICE_ANNUAL               — control cohort annual price id
//   STRIPE_PRICE_MONTHLY_EXPERIMENT   — experimental monthly price id (opt)
//   STRIPE_PRICE_ANNUAL_EXPERIMENT    — experimental annual price id (opt)

import { getFlag } from "./flags";

export type ActivePriceIds = {
  monthly: string;
  annual: string;
};

/** Returns the price IDs to charge a given user, honoring pricing.experiment. */
export async function getActivePriceIds(userId: string | null | undefined): Promise<ActivePriceIds> {
  const defaults: ActivePriceIds = {
    monthly: process.env.STRIPE_PRICE_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_ANNUAL ?? "",
  };

  // No flag rollouts when env not configured.
  if (!process.env.STRIPE_PRICE_MONTHLY_EXPERIMENT && !process.env.STRIPE_PRICE_ANNUAL_EXPERIMENT) {
    return defaults;
  }

  const inExperiment = await getFlag("pricing.experiment", {
    userId: userId ?? undefined,
  }).catch(() => false);

  if (!inExperiment) return defaults;

  return {
    monthly: process.env.STRIPE_PRICE_MONTHLY_EXPERIMENT ?? defaults.monthly,
    annual: process.env.STRIPE_PRICE_ANNUAL_EXPERIMENT ?? defaults.annual,
  };
}
