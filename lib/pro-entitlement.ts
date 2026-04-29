"use client";

// =============================================================================
// lib/pro-entitlement.ts — Track 5 server-side Pro entitlement hook.
// =============================================================================
//
// WHAT
//   useProEntitlement() — fetches /api/me/pro and returns
//     { entitlement, loading, isPro, source }
//   where `entitlement` is the row from public.pro_entitlements (or null).
//
// WHY (and why this is NOT lib/pro.ts)
//   lib/pro.ts is the client-side localStorage gate that's been shipping for
//   weeks. We deliberately did NOT replace it — that file's "Stripe-not-wired
//   means everyone is Pro" rule is still the policy until the publishable key
//   lands in Vercel. This hook is the new path: callers that want a real,
//   server-anchored "is this user Pro?" answer (e.g. server-issued links,
//   webhook-aware UI) import THIS module instead of lib/pro.ts.
//
//   Migration plan: once Stripe is wired and pro_entitlements is populated,
//   the client-side localStorage gate in lib/pro.ts becomes a fallback for
//   logged-out visitors only. Authenticated UI should switch to this hook.
//
// ENV VARS
//   None directly. The /api/me/pro route reads SUPABASE_SERVICE_ROLE_KEY.
// =============================================================================

import { useEffect, useState } from "react";

export type ProEntitlement = {
  user_id: string;
  source: "stripe" | "comp" | "manual";
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export type UseProEntitlementResult = {
  entitlement: ProEntitlement | null;
  loading: boolean;
  isPro: boolean;
  source: ProEntitlement["source"] | null;
  error: string | null;
};

/**
 * Returns the current user's Pro entitlement state from the server.
 * SSR returns the loading state; the first effect tick replaces it.
 */
export function useProEntitlement(): UseProEntitlementResult {
  const [entitlement, setEntitlement] = useState<ProEntitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/pro", { credentials: "include" });
        if (cancelled) return;
        if (!res.ok) {
          // 401/403 just means "not signed in" — treat as no entitlement.
          setEntitlement(null);
          setError(null);
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setEntitlement(json.entitlement ?? null);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isPro = computeIsPro(entitlement);
  return {
    entitlement,
    loading,
    isPro,
    source: entitlement?.source ?? null,
    error,
  };
}

function computeIsPro(e: ProEntitlement | null): boolean {
  if (!e) return false;
  // Active or trialing -> Pro. Past-due grants a grace period until
  // current_period_end (Stripe's default dunning window).
  const now = Date.now();
  const cpe = e.current_period_end ? Date.parse(e.current_period_end) : 0;
  const exp = e.expires_at ? Date.parse(e.expires_at) : 0;

  if (e.status === "active" || e.status === "trialing") {
    if (e.source === "comp" || e.source === "manual") {
      return exp ? now < exp : true;
    }
    return true;
  }
  if (e.status === "past_due") {
    return cpe ? now < cpe : false;
  }
  return false;
}
