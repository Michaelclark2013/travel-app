"use client";

import * as Sentry from "@sentry/nextjs";

let initialized = false;

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (typeof window === "undefined") return;
  if (initialized || !DSN) return;
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    environment: process.env.NODE_ENV,
  });
  initialized = true;
}

export function setSentryUser(id: string | null) {
  if (!DSN) return;
  if (id) Sentry.setUser({ id });
  else Sentry.setUser(null);
}

export const sentryEnabled = !!DSN;
