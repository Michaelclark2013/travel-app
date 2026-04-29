"use client";

import { useEffect } from "react";
import { initAnalytics, setAnalyticsConsent } from "@/lib/analytics";
import { initSentry } from "@/lib/sentry-client";

const KEY = "voyage:cookie-consent";

export default function ClientObservability() {
  useEffect(() => {
    // Sentry can run regardless of analytics consent — it's about catching
    // bugs, scoped to error events only and we set sendDefaultPii=false.
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
