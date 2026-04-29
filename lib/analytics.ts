"use client";

// Thin wrapper around PostHog. No-ops when keys aren't set so the rest of the
// app can call analytics.track() unconditionally.

import posthog from "posthog-js";

let initialized = false;
let optedIn = false;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (initialized || !KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    persistence: "localStorage",
    autocapture: false, // we'll send explicit events
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    loaded: () => {
      // Default to opted-out until cookie consent says otherwise.
      if (!optedIn) posthog.opt_out_capturing();
    },
  });
  initialized = true;
}

export function setAnalyticsConsent(consent: "all" | "essential") {
  if (typeof window === "undefined") return;
  optedIn = consent === "all";
  if (!initialized) initAnalytics();
  if (!KEY) return;
  if (consent === "all") posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!KEY || !optedIn || typeof window === "undefined") return;
  posthog.capture(event, props);
}

export function identify(id: string, props?: Record<string, unknown>) {
  if (!KEY || !optedIn || typeof window === "undefined") return;
  posthog.identify(id, props);
}

export function pageview(path: string) {
  if (!KEY || !optedIn || typeof window === "undefined") return;
  posthog.capture("$pageview", { $current_url: path });
}

export const analyticsEnabled = !!KEY;
