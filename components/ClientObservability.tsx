"use client";

import { useEffect } from "react";
import { initAnalytics, setAnalyticsConsent } from "@/lib/analytics";
import { initSentry } from "@/lib/sentry-client";
import { getConsent } from "@/lib/consent";

const KEY = "voyage:cookie-consent";

export default function ClientObservability() {
  useEffect(() => {
    // Track 8 GDPR/CCPA gate: analytics SDKs must not initialize unless the
    // user has affirmatively opted in. Sentry is the one exception — it's
    // scoped to error capture with sendDefaultPii=false, which we treat as a
    // legitimate-interest legal basis.
    if (!getConsent("analytics")) {
      initSentry();
      return;
    }

    initSentry();

    // Initialize analytics in opted-out mode; flip if consent says "all".
    initAnalytics();
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(KEY) as
        | "all"
        | "essential"
        | null;
      if (stored) setAnalyticsConsent(stored);
    }

    function onConsent(e: Event) {
      const detail = (e as CustomEvent<"all" | "essential">).detail;
      setAnalyticsConsent(detail);
    }
    window.addEventListener("voyage:cookie-consent", onConsent);
    return () => {
      window.removeEventListener("voyage:cookie-consent", onConsent);
    };
  }, []);
  return null;
}
